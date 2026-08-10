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
    /* ⛔ LA PAGE 1 N'A PAS LE MÊME CHEMIN QUE LES AUTRES — et je m'étais
       trompé. J'avais fabriqué `100I16oM122663` par SYMÉTRIE avec les pages
       suivantes ; sa capture du 03/08 (raccourci « Teste full pag… ») montre
       que la première page s'écrit `100oM122663`, SANS le `I16`. Ce segment
       n'apparaît qu'avec un décalage. Une adresse déduite par symétrie est une
       adresse inventée : celle-ci vient de son écran. */
    patron: 'https://www.idealo.fr/prechcat/100I16-{offset}oM122663.html?q=dewalt&sortKey=maxPrice',
    patronPage1: 'https://www.idealo.fr/prechcat/100oM122663.html?q=dewalt&sortKey=maxPrice',
    aVerifier: 'le PAS de la pagination (15) est déduit de deux points : page 7 → 90. '
      + 'Le balayage le prouve seul — si le pas est juste, le nombre de références '
      + 'DISTINCTES cumulées croît d\'environ 60 par page ; s\'il est trop petit, les '
      + 'pages se recouvrent et il stagne. C\'est `couverture.refsDistinctes` qui '
      + 'tranche, sans rien avoir à supposer.',
    /* ⛔ RECHERCHE PAR RÉFÉRENCE — le seul chemin PROUVÉ vers une couverture
       complète. Le paramètre `q=` de cette adresse vient de SON écran : il est
       déjà dans le patron ci-dessus, avec le nom de la marque comme valeur. On
       ne fait qu'y mettre une RÉFÉRENCE à la place, sur la même catégorie.
       ⚠️ Ce qui reste SUPPOSÉ, et qui se prouve tout seul au premier essai : que
       `q=<référence>` ramène la fiche de cette référence. Si c'est faux, le
       relevé rend `parsed: 0` avec son diagnostic — pas un silence. */
    patronRecherche: 'https://www.idealo.fr/prechcat/100oM122663.html?q={ref}',
    note: 'trié par prix DÉCROISSANT, donc le balayage part de la DERNIÈRE page — '
      + 'les articles les moins chers bougent le plus.'
  },

  /* ── MAKITA chez idealo (09/08/2026) ──────────────────────────────────────
     URLs données par l'user, DEPUIS SON ÉCRAN (jamais déduites) :
     · page 1   : /prechcat/100oE0oJ1oM124301.html?qr=false      (SANS I16)
     · page 2   : /prechcat/100I16-15oE0oJ1oM124301.html?qr=false
     · page 3   : /prechcat/100I16-30oE0oJ1oM124301.html?qr=false
     · page 112 : /prechcat/100I16-1665oE0oJ1oM124301.html?qr=false
     Le pas de 15 est PROUVÉ par trois points (15, 30, et 1665 = 111 × 15) —
     pas deux comme DeWALT à l'époque. Catégorie idealo : M124301. */
  'MAKITA@idealo': {
    site: 'idealo',
    pages: 112,
    pas: 15,
    parPage: 60,
    ordre: 'desc',
    patron: 'https://www.idealo.fr/prechcat/100I16-{offset}oE0oJ1oM124301.html?qr=false',
    patronPage1: 'https://www.idealo.fr/prechcat/100oE0oJ1oM124301.html?qr=false',
    /* ⛔ RECHERCHE PAR RÉFÉRENCE. Mesuré sur son balayage du 10/08/2026, et
       c'est ce qui rend ce chemin NÉCESSAIRE : la grille de catégorie ne peut
       pas donner 100 %. Sur les 145 racines nues que la grille montre et que le
       catalogue décline, **134 sont MUETTES** sur leur contenu (ni batteries,
       ni chargeur, ni coffret) et les 11 qui parlent ne désignent aucune fiche
       unique — donc ZÉRO rapprochement possible, quel que soit le code. Une
       recherche par référence, elle, ramène la référence EXACTE : plus
       d'ambiguïté à arbitrer, donc plus de risque d'écrire un coût d'outil nu
       sur un kit.
       ⚠️ SUPPOSÉ, et écrit comme tel : le paramètre `q=` est PROUVÉ sur ce site
       (il vit dans le patron de l'autre marque, venu de son écran) mais ses URL
       Makita ne le portent pas. Si `q=` ne s'applique pas à cette catégorie, le
       relevé rendra `parsed: 0` AVEC son diagnostic — jamais un silence. */
    patronRecherche: 'https://www.idealo.fr/prechcat/100oE0oJ1oM124301.html?qr=false&q={ref}',
    aVerifier: 'parPage (60) est supposé IDENTIQUE à DeWALT (même site, même gabarit de '
      + 'grille) — le premier balayage tranche : `tuilesDansLaPage` le mesure page par '
      + 'page, et `couverture.refsDistinctes` doit croître d\'environ 60 par page. '
      + 'Ses URLs ne portent pas de sortKey : l\'ordre réel se lira sur le relevé.',
    note: 'ATTENTION lecture des références : la tête de référence « connue » du parseur '
      + '(teteConnue) ne couvre que la nomenclature DeWALT — une réf Makita SANS chiffre '
      + 'et à tiret peut être manquée. Les réfs Makita courantes (DTW700Z, DHP486…) '
      + 'portent des chiffres et passent par le chemin normal.'
  },

  /* ── MILWAUKEE chez idealo (10/08/2026) ───────────────────────────────────
     URLs données par l'user, DEPUIS SON ÉCRAN (jamais déduites) :
     · page 1  : /prechcat/100oM140603.html?qr=false&sortKey=maxPrice   (SANS I16)
     · page 2  : /prechcat/100I16-15oM140603.html?qr=false&sortKey=maxPrice
     · page 3  : /prechcat/100I16-30oM140603.html?qr=false&sortKey=maxPrice
     · page 67 : /prechcat/100I16-990oM140603.html?qr=false&sortKey=maxPrice
     ⚠️ QUATRE POINTS, DONC LE PAS N'EST PLUS UNE SUPPOSITION : 0, 15, 30, et
     990 = 66 × 15. C'est le premier plan des trois où la loi de pagination est
     PROUVÉE au lieu d'être déduite de deux points (E-112, déjà payée).
     Catégorie idealo : M140603. Le chemin ne porte ni `oE0` ni `oJ1`.
     `sortKey=maxPrice` est écrit dans SES adresses : tri par prix DÉCROISSANT,
     comme l'autre marque — le balayage part donc de la dernière page. */
  'MILWAUKEE@idealo': {
    site: 'idealo',
    pages: 67,
    pas: 15,
    parPage: 60,
    ordre: 'desc',
    patron: 'https://www.idealo.fr/prechcat/100I16-{offset}oM140603.html?qr=false&sortKey=maxPrice',
    patronPage1: 'https://www.idealo.fr/prechcat/100oM140603.html?qr=false&sortKey=maxPrice',
    /* ⛔ RECHERCHE PAR RÉFÉRENCE — obligatoire, une porte le vérifie : sans
       elle la marque reste plafonnée par la grille sans que rien ne le dise.
       ⚠️ SUPPOSÉ, et écrit comme tel : `q=` est PROUVÉ sur ce site (il vient
       de son écran, dans le patron de l'autre marque) mais ses adresses
       Milwaukee ne le portent pas. Si le paramètre ne s'applique pas à cette
       catégorie, le relevé rend `parsed: 0` AVEC son diagnostic, jamais un
       silence. */
    patronRecherche: 'https://www.idealo.fr/prechcat/100oM140603.html?qr=false&q={ref}',
    aVerifier: 'parPage (60) est supposé IDENTIQUE aux deux autres marques — même site, '
      + 'même gabarit de grille. Le premier balayage tranche seul : `tuilesDansLaPage` '
      + 'le mesure page par page, et `couverture.refsDistinctes` doit croître d\'environ '
      + '60 par page. Le PAS, lui, n\'est pas à vérifier : quatre de ses adresses le '
      + 'prouvent.',
    note: '⛔ AUCUNE FICHE DE CETTE MARQUE AU CATALOGUE au jour de la déclaration '
      + '(mesuré : Makita 611, DeWALT 1047, Festool 50, Milwaukee 0). Le premier '
      + 'balayage ne mettra donc AUCUN prix à jour : il sert à DÉCOUVRIR — tout ce '
      + 'qu\'il lit sortira dans `unknown`, avec titre, prix et contenu. C\'est normal, '
      + 'ce n\'est pas une panne, et il ne faut pas le lire comme un échec.'
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
