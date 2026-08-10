'use strict';
/* ⛔ La barrière d'achat est requise EN TÊTE, avec les autres dépendances, et
   pas au milieu du fichier : `parseIdealo` s'en sert bien avant la ligne où
   `nomenclature` est chargée. Ça marcherait quand même — le module se charge
   entièrement avant le premier appel — mais une dépendance qu'on ne voit pas
   en ouvrant le fichier est une dépendance qu'on casse sans le savoir. */
var barriere = require('./barriere-achat.js');
// Parseur des pages « marque » de cotébrico → [{ sku, price, name, promo }].
//
// price = le prix TTC **RÉELLEMENT AFFICHÉ, PROMO COMPRISE**.
// ⚠️ CE COMMENTAIRE DISAIT L'INVERSE JUSQU'AU 31/07/2026 (« HORS PROMO, on
// prend le Prix de base »). C'était faux, et prouvé faux en exécutant le
// parseur sur un bloc promo : il renvoie 149,90 là où « Prix de base
// 199,00 € » figure dans le même bloc. Un commentaire qui ment sur du calcul
// de prix est pire que pas de commentaire — on le croit sans le vérifier.
//
// Le comportement, lui, est VOULU (décision produit du traqueur) : si
// cotébrico solde, l'user achète soldé, donc il vend soldé. Le relevé tourne
// 2×/jour et se réajuste dès la fin de la promo.
//
// `promo` est un simple booléen « ce bloc contenait un Prix de base ».
// ⛔ L'ANCIEN PRIX N'EST PAS CAPTURÉ — seulement le fait qu'il existait. Il ne
// doit JAMAIS servir de prix de référence barré sur le site : un tarif
// fournisseur n'est pas notre prix de référence (registre J4, décision D-004).
//
// Robuste : accepte du texte propre OU du HTML brut (on nettoie les balises avant).
// Générique : la marque est paramétrable (DEWALT, MAKITA, BOSCH…) car sur cotébrico
// la réf est toujours préfixée par le nom de marque (« … - DEWALT DCF887P2 »).

// Décode les quelques entités HTML utiles + retire les balises → texte plat.
function stripHtml(input) {
  var s = String(input || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
       .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  /* ⛔ UNE BALISE DE BLOC EST UNE FIN DE LIGNE, PAS UNE ESPACE. Mesuré sur les
     pages limites : un même contenu envoyé en HTML rendait `items: 0` là où le
     texte rendait 1. Toutes les balises devenaient des espaces, donc titre,
     sous-titre et prix se retrouvaient collés sur UNE ligne — et tout ce
     parseur travaille par lignes. Le raccourci de l'user envoie du texte, mais
     un jour où il enverra du HTML, il aurait eu un zéro sans cause visible.
     ⚠️ On ne coupe QUE sur les balises qui font vraiment un bloc : couper sur
     un `<b>` au milieu d'un titre le briserait en deux. */
  s = s.replace(/<\/?(?:p|div|li|ul|ol|tr|td|th|h[1-6]|br|section|article|header|footer|nav|table|thead|tbody|option|dt|dd|figure|figcaption|blockquote)\b[^>]*>/gi, '\n')
       .replace(/<[^>]+>/g, ' ');                 // le reste des balises
  s = s.replace(/&nbsp;|&#160;|&#0*160;|&#8239;|&#0*8239;|&#8201;/gi, ' ')
       .replace(/&euro;|&#8364;|&#0*8364;/gi, '€')
       .replace(/&amp;/gi, '&')
       .replace(/&quot;/gi, '"')
       .replace(/&#0*39;|&apos;/gi, "'")
       .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
       .replace(/&eacute;/gi, 'é').replace(/&egrave;/gi, 'è').replace(/&agrave;/gi, 'à');
  return s;
}

// « 1 190,00 » / « 240,89 » (espaces fines/insécables inclus) → nombre.
function parsePriceFR(str) {
  if (str == null) return null;
  var n = parseFloat(String(str).replace(/[\s   ]/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function parseCotebrico(rawText, brand) {
  var out = [];
  if (!rawText) return out;
  brand = (brand || 'DEWALT');
  var text = stripHtml(rawText).replace(/[ \t   ]+/g, ' ');
  var brandRe = new RegExp(escapeRe(brand) + '\\s+([A-Z0-9][A-Z0-9.\\/\\-]*[A-Z0-9])', 'gi');
  // Chaque fiche produit de la grille se termine par « Ajouter au panier ».
  var blocks = text.split(/Ajouter au panier/);
  var seen = {};
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    /* ── ÉTAT DE STOCK DE CETTE CARTE ──────────────────────────────────────
       Demandé par l'user le 01/08/2026 : dix produits EN RUPTURE chez le
       fournisseur allaient faire MONTER les prix du site — un prix affiché
       chez un vendeur où l'on ne peut pas acheter n'est pas un coût
       d'approvisionnement.

       ⚠️ D'OÙ VIENT CE DÉCOUPAGE — mesuré sur SA capture de la grille
       (01/08/2026), la page étant injoignable depuis le dépôt : le badge
       « ✔ En stock » est affiché SOUS le bouton « Ajouter au panier ».
       Comme on découpe les blocs SUR ce bouton, le badge d'une carte tombe
       AU DÉBUT DU BLOC SUIVANT. On lit donc la tête du bloc i+1.

       Trois états, et l'inconnu est assumé :
         true  → « En stock » lu en tête du bloc suivant, sans mot de rupture
         false → un mot de rupture dans la carte ou en tête du bloc suivant
         null  → aucun signal : comportement d'avant, on ne casse rien.
       ⛔ Si cotébrico écrit la rupture autrement, une capture d'une carte en
       rupture suffit à ajuster RUPTURE_RE — le motif est CE constant-ci. */
    /* ⚠️ ON NE LIT QUE LA TÊTE DU BLOC SUIVANT — premier jet corrigé sur
       preuve : tester aussi la fin du bloc COURANT faisait hériter la rupture
       de la carte précédente (son badge vit en tête de NOTRE bloc). Une carte
       n'a JAMAIS son propre badge dans son bloc : il est après le bouton. */
    var teteSuivante = (blocks[i + 1] || '').slice(0, 160);
    var enStock = null;
    if (RUPTURE_RE.test(teteSuivante)) enStock = false;
    else if (/en\s+stock/i.test(teteSuivante)) enStock = true;
    var skus = [], m;
    brandRe.lastIndex = 0;
    while ((m = brandRe.exec(b)) !== null) skus.push(m[1].toUpperCase());
    if (!skus.length) continue;
    var sku = skus[skus.length - 1];              // le TITRE (dernière réf) = vraie réf produit
    // Prix = le PRIX REELLEMENT AFFICHE (promo COMPRISE) = « Prix X € ».
    // Decision produit (traqueur) : on PREND la promo pour etre competitif. Sur car
    // le traqueur tourne 2x/jour et se reajuste des que la promo se termine → marge
    // 15% calee sur le cout REEL du jour (si cotebrico solde, l'user achete soldé aussi).
    // Le « Prix de base » barre est volontairement ignore. Le prix courant apparait
    // AVANT « Prix de base » sur la grille → le 1er match = le prix courant.
    var pm = b.match(/Prix\s+([\d\s\u00a0\u202f\u2009]+,\d{2})\s*€/);
    if (!pm) continue;
    var price = parsePriceFR(pm[1]);
    if (price == null || price <= 0) continue;
    var promo = /Prix de base/.test(b); // info seulement (rapport)
    if (seen[sku]) continue;                        // dédoublonnage
    seen[sku] = true;
    // Nom (best-effort) : le segment « … - BRAND SKU » le plus proche du prix.
    var name = '';
    var nm = b.match(new RegExp('([^\\n.]{4,120}?)\\s*-\\s*' + escapeRe(brand) + '\\s+' + escapeRe(sku), 'i'));
    if (nm) name = nm[1].trim();
    out.push({ sku: sku, price: price, name: name, promo: promo, enStock: enStock });
  }
  return out;
}

// Règle user 25/07 : quand le fournisseur vend une DÉCLINAISON moins cher que
// la réf principale (ex. DBS180ZJ avec coffret < DBS180Z nu), ON ACHÈTE la
// moins chère → le prix de référence est le MIN des sources. Le produit porte
// `srcAltSkus: [...]` ; le traqueur prend min(prix propre, prix des alt
// PRÉSENTES sur la page). Une alt absente de la page est ignorée. PURE (testée
// par check-price-watch).
function pickCheapestSource(ownPrice, altSkus, parsedBySku) {
  var best = ownPrice;
  if (Array.isArray(altSkus)) {
    for (var i = 0; i < altSkus.length; i++) {
      var alt = parsedBySku && parsedBySku[String(altSkus[i]).toUpperCase()];
      if (typeof alt === 'number' && alt > 0 && alt < best) best = alt;
    }
  }
  return best;
}

/* Mots qui signalent une RUPTURE sur la grille fournisseur. Centralisé ici :
   c'est LE motif à ajuster si une capture montre un autre libellé. */
var RUPTURE_RE = /rupture|indisponible|\u00e9puis\u00e9|hors\s+stock|non\s+disponible/i;

/* Une SUITE D'UNIT\u00c9S (tensions, capacit\u00e9s, dimensions) qui ressemble \u00e0 une
   r\u00e9f sans en \u00eatre une : \u00ab 18V-54V \u00bb, \u00ab 12AH-4AH \u00bb, \u00ab 9AH-3AH \u00bb\u2026 Mesur\u00e9 sur
   la vraie page clickoutil \u2014 voir le commentaire au point d'usage. */
var UNITE_RE = /^[0-9]+([.,][0-9]+)?(V|AH|MM|CM|NM|W|KG|GA|L)([-X\/][0-9]+([.,][0-9]+)?(V|AH|MM|CM|NM|W|KG|GA|L)?)*$/;

/* \u2500\u2500 PARSEUR CLICKOUTIL (01/08/2026) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Le site est injoignable depuis le d\u00e9p\u00f4t (CONNECT 403, mesur\u00e9). TOUT ce qui
   suit est mesur\u00e9 sur la page r\u00e9elle envoy\u00e9e par le raccourci de l'user,
   coll\u00e9e par lui dans un document Pages et d\u00e9compress\u00e9e ici (554 titres lus).

   Une carte clickoutil, dans l'ordre du texte :
     Ajouter au panier \u00b7 Afficher plus \u00b7 TITRE \u2026 R\u00c9F [\u2026 ] DEWALT \u00b7 DEWALT
     \u00b7 \u00ab 1 739,00 \u20ac TTC \u00bb [prix barr\u00e9 APR\u00c8S si promo] \u00b7 \u00ab 1449,17 \u20ac HT \u00bb
     \u00b7 description \u00b7 \u00ab Livraison \u2026 \u00bb \u00b7 [queue de carte : + Option
     disponible / OFFRE DU MOMENT / -429,10 \u20ac]
   Diff\u00e9rences avec cot\u00e9brico, toutes mesur\u00e9es :
     \u00b7 la r\u00e9f est AVANT la marque (\u00ab DCE079D1G-QW DEWALT \u00bb), parfois au
       MILIEU du titre (\u00ab DW743N-QS \u00d8250 mm DEWALT \u00bb, 126 cas sur 554) ;
     \u00b7 le prix s'\u00e9crit \u00ab X,XX \u20ac TTC \u00bb \u2014 jamais le mot \u00ab Prix \u00bb ; le HT est
       juste dessous (\u00ab \u20ac HT \u00bb) et ne doit JAMAIS \u00eatre pris ; en promo, le
       prix barr\u00e9 vient APR\u00c8S \u00ab \u20ac TTC \u00bb sur la m\u00eame ligne \u2192 le 1er match
       \u00ab \u20ac TTC \u00bb est le prix courant (et on ne capture pas le barr\u00e9, J4) ;
     \u00b7 AUCUN badge de stock par carte sur cette grille \u2192 enStock = null ;
     \u00b7 275 titres sur 554 sont des PACKS mont\u00e9s par le site
       (\u00ab \u2026 + 2 batteries + 1 chargeur DCB118-QW DEWALT \u00bb) : la r\u00e9f coll\u00e9e \u00e0
       la marque y est celle d'un COMPOSANT. \u26d4 \u00c9crire le prix d'un pack sur
       la r\u00e9f d'un composant pr\u00e9sent au catalogue, c'est corrompre un co\u00fbt \u2014
       l'argent passe avant la couverture : tout titre \u00e0 \u00ab + \u00bb est \u00c9CART\u00c9 et
       LIST\u00c9 (packs), jamais devin\u00e9.

   La r\u00e9f d'un titre simple = l'UNIQUE candidat \u00ab \u22652 lettres, \u22651 chiffre,
   \u22655 caract\u00e8res \u00bb \u2014 mesur\u00e9 : isole DCE079D1G-QW / DW743N-QS et rejette
   \u00ab 18V \u00bb, \u00ab 250 \u00bb, \u00ab 1800 \u00bb, \u00ab ROLLCAGE \u00bb. Z\u00e9ro candidat (\u00ab Raboteuse de
   chantier 1800 W \u00bb) ou plusieurs \u2192 \u00e9cart\u00e9 et compt\u00e9 (sansRef). Rien de
   silencieux : les deux listes sortent dans la r\u00e9ponse du traqueur.

   \u26a0\ufe0f R\u00c9\u00c9CRIT PAR LIGNES le 01/08/2026 au soir, sur le DIAGNOSTIC DE LA
   PRODUCTION : le texte que le raccourci envoie r\u00e9ellement ne contient
   AUCUN \u00ab Ajouter au panier \u00bb (`boutonsPanier: 0` sur 92 255 octets re\u00e7us \u2014
   le raccourci livre le TEXTE de la page, pas son HTML ; le premier jet,
   prouv\u00e9 sur le document Pages, d\u00e9coupait sur un bouton qui n'existe pas
   dans le flux r\u00e9el). Le seul ancrage pr\u00e9sent dans LES DEUX corpus mesur\u00e9s
   (document Pages ET diagnostic production) :

     TITRE \u2026 R\u00c9F \u2026 DEWALT      \u2190 la ligne juste au-dessus (ou s\u00e9par\u00e9e par
     DEWALT                      l'\u00e9tiquette marque seule)
     279,90 \u20ac TTC [barr\u00e9]      \u2190 la ligne d'ancrage
     233,25 \u20ac HT               \u2190 jamais prise (pas \u00ab TTC \u00bb)

   Rend { items: [...], packs: [titres], sansRef: [titres] }. */
function parseClickoutil(rawText, brand) {
  var out = { items: [], packs: [], sansRef: [] };
  if (!rawText) return out;
  brand = (brand || 'DEWALT');
  var brandUp = brand.toUpperCase();
  /* Les SAUTS DE LIGNE portent la structure : on les garde, on ne replie
     que les espaces \u00c0 L'INT\u00c9RIEUR des lignes. */
  var lignes = stripHtml(rawText).split(/\n+/).map(function (l) {
    return l.replace(/[ \t   ]+/g, ' ').trim();
  }).filter(Boolean);
  var prixLigne = /^([\d\s   ]*\d,\d{2})\s*\u20ac\s*TTC\b(.*)$/;
  var candidatRe = /[A-Z0-9][A-Z0-9.\/-]{3,}[A-Z0-9]/g;
  var finMarque = new RegExp(escapeRe(brand) + '\\s*$', 'i');
  var seen = {};
  for (var i = 1; i < lignes.length; i++) {
    var pm = lignes[i].match(prixLigne);
    if (!pm) continue;
    var price = parsePriceFR(pm[1]);
    if (price == null || price <= 0) continue;
    // Au-dessus du prix : l'\u00e9tiquette marque seule, puis le TITRE.
    var j = i - 1;
    if (j >= 0 && lignes[j].toUpperCase() === brandUp) j--;
    var titre = j >= 0 ? lignes[j] : '';
    /* Un prix \u00ab \u20ac TTC \u00bb dont la ligne du dessus ne finit pas par la marque
       n'est pas une carte de cette marque (panier, en-t\u00eate\u2026) : \u00e9cart\u00e9, dit. */
    if (!finMarque.test(titre)) {
      out.sansRef.push({ titre: (titre || '(rien au-dessus du prix)').slice(0, 120), prix: price });
      continue;
    }
    /* Un PACK monté par le site (titre à « + ») ne s'identifie JAMAIS par une
       réf — la seule réf du titre est celle d'un COMPOSANT, et écrire le prix
       du pack dessus corromprait un coût. Mais il s'identifie très bien par
       son NOM : depuis le 02/08/2026 (décision de l'user, qui VEUT ces packs
       au catalogue), il sort avec son prix et s'apparie par `srcNom`, comme
       les accessoires sans réf. Le verrou composant reste entier. */
    if (/\s\+\s/.test(titre)) { out.packs.push({ titre: titre.slice(0, 160), prix: price }); continue; }
    var candidats = [], cm;
    candidatRe.lastIndex = 0;
    while ((cm = candidatRe.exec(titre)) !== null) {
      var t = cm[0].toUpperCase();
      if (t === brandUp) continue;
      if (!/\d/.test(t) || !/[A-Z].*[A-Z]/.test(t)) continue;  // \u22651 chiffre, \u22652 lettres
      /* \u26a0\ufe0f Une SUITE D'UNIT\u00c9S n'est pas une r\u00e9f \u2014 mesur\u00e9 sur la vraie page :
         \u00ab Batterie XR 18V-54V 12Ah-4Ah Flexvolt DCB548-XJ \u00bb portait trois
         candidats (18V-54V, 12AH-4AH, DCB548-XJ) et tombait en sansRef.
         Le filtre r\u00e9cup\u00e8re 5 r\u00e9fs r\u00e9elles (3 batteries Flexvolt, le laser
         DCE089NG18-XJ, le chargeur DCB1104-QW) sans en inventer aucune. */
      if (UNITE_RE.test(t)) continue;
      if (candidats.indexOf(t) === -1) candidats.push(t);
    }
    /* sansRef porte le PRIX : c'est lui qui permet de suivre par NOM les
       accessoires sans r\u00e9f\u00e9rence (r\u00e8gle de l'user : \u00ab comment sont nomm\u00e9s
       les produits s'il n'y a pas de r\u00e9f\u00e9rence \u00bb). */
    if (candidats.length !== 1) { out.sansRef.push({ titre: titre.slice(0, 120), prix: price }); continue; }
    var sku = candidats[0];
    if (seen[sku]) continue;
    seen[sku] = true;
    /* Promo : le prix barr\u00e9 vit SUR LA LIGNE DU TTC, apr\u00e8s lui. On ne le
       capture pas (J4, D-004) \u2014 on note seulement qu'il existait.
       \u26a0\ufe0f 1er jet FAUX, mesur\u00e9 : 147 promos sur 147 \u2014 le prix HT suit
       TOUJOURS le TTC ; le barr\u00e9 est le seul prix SANS le suffixe HT. */
    var promo = /\d,\d{2}\s*\u20ac(?!\s*HT)/.test(pm[2]);
    var name = titre.replace(finMarque, '').trim().slice(0, 120);
    out.items.push({ sku: sku, price: price, name: name, promo: promo, enStock: null });
  }
  return out;
}

/* \u2500\u2500 PARSEUR IDEALO (02/08/2026) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Comparateur de prix : chaque carte porte \u00ab \u00e0 partir de X \u20ac \u00bb \u2014 LE MOINS
   CHER parmi \u00ab N offres \u00bb de marchands fran\u00e7ais. C'est pr\u00e9cis\u00e9ment le co\u00fbt
   recherch\u00e9 (d\u00e9cision user : ses achats sont livr\u00e9s en France m\u00e9tropolitaine,
   le port marchand est le plus souvent gratuit).

   Format MESUR\u00c9 sur le diagnostic de SON dryRun (le site bloque les acc\u00e8s
   non-navigateur \u2014 403 sur mes outils \u2014 mais r\u00e9pond aux Raccourcis) :

     DeWalt DCD805                     \u2190 MARQUE puis R\u00c9F, seules sur la ligne
     Perceuse-visseuse \u00e0 percussion\u2026   \u2190 description
     5                                 \u2190 note
     94 offres                         \u2190 nombre de marchands
     \u00e0 partir de118,86 \u20ac               \u2190 le prix, PARFOIS COLL\u00c9 \u00e0 \u00ab de \u00bb

   \u26a0\ufe0f La page porte aussi des blocs hors sujet (\u00ab Produits favoris \u00bb :
   t\u00e9l\u00e9phones) avec \u00ab \u00e0 partir de \u00bb : le prix n'est accept\u00e9 que dans une
   FEN\u00caTRE born\u00e9e sous un titre \u00ab MARQUE R\u00c9F \u00bb \u2014 jamais orphelin.
   Pas de badge de stock ni de prix barr\u00e9 sur une liste de comparateur :
   enStock = null, promo = false. */
/* \u26d4 R\u00c9\u00c9CRIT LE 03/08/2026, SUR LE TEXTE COMPLET D'UNE PAGE ENVOY\u00c9 PAR L'USER.
   \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Le premier jet ne lisait qu'UN format et ratait tout le reste : mesur\u00e9
   13 produits lus sur 57 pr\u00e9sents dans le texte (77 % perdus), et toujours
   les m\u00eames \u2014 ceux du milieu, seuls \u00e9crits au format que je reconnaissais.
   L'user l'a vu \u00e0 l'\u0153il avant que le moindre chiffre ne le dise.

   CE QUE LA PAGE CONTIENT R\u00c9ELLEMENT \u2014 deux natures de blocs, et la
   distinction porte de l'ARGENT :

   \u2460 CARTE PRODUIT idealo (le prix agr\u00e9g\u00e9 de N marchands) \u2014 se termine
      TOUJOURS par \u00ab D\u00e9tails du produit \u00bb :
        DeWalt DCG460X2-QW              \u2190 r\u00e9f seule
        Meuleuse d'angle sans fil, 54 V \u2190 description
        11 offres
        \u00e0 partir de669,90 \u20ac             \u2190 prix, parfois COLL\u00c9 \u00e0 \u00ab de \u00bb
        D\u00e9tails du produit
      Variantes mesur\u00e9es, toutes rat\u00e9es par le premier jet :
        \u00b7 \u00ab 1 offre \u00bb puis \u00ab 685,95 \u20ac \u00bb \u2014 SANS \u00ab \u00e0 partir de \u00bb
        \u00b7 \u00ab DeWalt DCH333 (1x Batterie 9 Ah + \u2026) \u00bb \u2014 texte APR\u00c8S la r\u00e9f

   \u2461 OFFRE D'UN MARCHAND \u2014 porte \u00ab Vendu par : \u00bb et \u00ab D\u00e9tails de l'offre \u00bb :
        D\u00e9broussailleuse 54V DCMST922N-XJ + 1 batterie + 1 chargeur DEWALT
        Vendu par : Clickoutil.com
        694,90 \u20ac TVA incluse
      \u26d4 JAMAIS CAPT\u00c9E, et c'est d\u00e9lib\u00e9r\u00e9 : ces titres sont des LOTS
      (\u00ab + 1 batterie + 1 chargeur \u00bb). \u00c9crire ce prix sur la r\u00e9f d'un
      composant corromprait un co\u00fbt d'achat \u2014 c'est la r\u00e8gle d'argent la plus
      ancienne du traqueur. Ces blocs partent dans `sansRef`, list\u00e9s.

   Le d\u00e9coupage se fait donc sur ces deux ancres, pas sur une fen\u00eatre de
   lignes : une fen\u00eatre devine, une ancre constate. */

/* ══ PROMOUVOIR LA RÉFÉRENCE D'UNE OFFRE MARCHANDE ══════════════════════════
   ⛔⛔ DEMANDE DE L'USER, 04/08/2026 : « dans le titre tu n'es pas capable de
   comprendre ce que c'est ? Moi en un coup d'œil rapide j'arrive très bien à
   déterminer ce que c'est exactement. » Il a raison : « DEWALT Foret métal
   HSS-G Coffret 29 pièces - DT7926-XJ » se lit sans effort.

   CE QUI SE PASSAIT. Les offres marchandes (les vendeurs listés sous chaque
   produit) partaient TOUTES au registre des écartées, référence comprise.
   Mesuré sur son balayage : 2 162 offres, dont 999 portent UNE SEULE référence
   propre — et 332 fiches importées ne pouvaient donc pas être suivies.

   ⛔⛔ ARGENT — LES QUATRE GARDES, ET POURQUOI CHACUNE EXISTE. Le prix d'une
   offre devient un COÛT D'ACHAT : s'il se pose sur la mauvaise fiche, on vend
   à perte. Mesuré sur les mêmes 2 162 offres :
     · 364 portent PLUSIEURS références → on n'arbitre pas ;
     · 268 sont des LOTS (« + », « & », « set », « kit ») → la référence n'y
       est qu'un COMPOSANT. « Power Set 1×18V 5,0 Ah + DCB107 » à 90 € aurait
       posé le prix d'un ensemble sur un simple chargeur ;
     ·  53 sont vendues POUR une machine → c'est un accessoire, pas la machine
       (le piège du DCE560 : un kit de conversion à 123,99 € pour un pistolet
       qui en vaut 244,86) ;
     ·  38 sont d'occasion ou reconditionnées → ce n'est pas notre produit.
   Ce qui reste est sûr : une référence unique, un produit entier, neuf.
   ⚠️ PORTE J4 LUE : rien ici ne fixe un prix. On rattache un montant déjà
   affiché à la référence que le titre NOMME — et on refuse dès qu'un doute
   subsiste, parce qu'un coût faux se propage à toute la chaîne. */
/* ⛔⛔⛔ « POUR » NE VEUT PAS DIRE LA MÊME CHOSE SELON CE QUI SUIT.
   Défaut démontré par l'user le 04/08/2026, captures d'écran à l'appui, et il
   avait raison sur les trois cas :
     · « DCB117-QW — Chargeur de piles, POUR technologie de batterie Li-Ion »
       est un CHARGEUR, pas un accessoire. « pour » y introduit une
       CARACTÉRISTIQUE, pas une machine.
     · « Tête d'outil réglable en cuivre 2,2 cm POUR DCE4500 (DCE450078) »
       porte DEUX références : celle de la MACHINE (DCE4500, après « pour ») et
       la SIENNE (DCE450078, entre parenthèses). Ma règle « plusieurs
       candidats ⇒ on refuse » la jetait, alors que le titre dit tout.
     · « Barre POUR scie Stationnaire DeWALT N233859 » : sa référence est
       N233859, et « pour scie » dit que c'est un accessoire.
   Mesuré sur ces cinq titres : 5 échecs sur 5. Je lisais un MOT, pas une
   phrase — exactement le reproche.

   ⛔ CE QUE FAIT LA LECTURE MAINTENANT, dans l'ordre :
     ① relever tous les candidats de référence avec leur position ;
     ② marquer COMPATIBILITÉ ceux qu'un « pour / für / for / compatible »
       introduit directement — ce sont les machines visées, jamais l'article ;
     ③ ce qui reste est la référence PROPRE de l'article. Une seule ⇒ on la
       prend ; zéro ou plusieurs ⇒ on refuse, comme avant.
   ⚠️ ARGENT, ET PORTE J4 LUE : c'est la garde qui empêche d'écrire le prix
   d'une tête de cuivre à 80,84 € sur la machine DCE4500. Elle ne s'assouplit
   pas, elle devient JUSTE — on distingue enfin les deux références au lieu de
   tout jeter. */
/* ⛔⛔ « SET DE 2200 PIÈCES » N'EST PAS UN ASSEMBLAGE — C'EST UNE QUANTITÉ.
   Défaut mesuré le 04/08/2026 : 65 des 104 références restantes tombaient ici.
   Ma garde rejetait sur les MOTS « set », « kit », « lot », alors que
   « Clou, Taille 34/63 mm, Set de 2200 Pièces » ou « Lot de 3 forets étagés »
   désigne UN produit vendu en quantité, avec sa propre référence.
   ⛔ CE QUI EST VRAIMENT DANGEREUX, ET QUI RESTE INTERDIT : un assemblage de
   produits DISTINCTS, chacun avec sa référence — « Power Set 1×18V 5,0 Ah
   **+** DCB107 ». Là, la référence lue n'est qu'un COMPOSANT, et son prix est
   celui de l'ensemble. Deux gardes suffisent et sont plus justes qu'une liste
   de mots : le JOINTEUR (« + », « & ») et la règle « plusieurs références
   nommées ⇒ on refuse », qui existait déjà.
   ⚠️ PORTE J4 LUE : on n'élargit pas au hasard, on remplace un critère
   lexical par un critère STRUCTUREL — c'est la même leçon qu'en E-406, où
   blacklister des formulations avait laissé passer les frais de port.
   ⛔⛔ SECOND TOUR, 05/08/2026 : le JOINTEUR SEUL ne suffisait pas non plus.
   « Pack de batteries DCB112D2 … 2 batteries + Chargeur DCB112 » énumère le
   CONTENU d'un article qui a sa référence ; le refuser était aussi faux que
   d'accepter « … DT2296-QZ + DEWALT Scie Sauteuse … ». Le jointeur est donc
   jugé par `assemblageDeProduits()` — une référence COLLÉE à lui — et il ne
   reste ici que la seule formule que le fabricant réserve aux assemblages. */
var OFFRE_LOT = /\bpower ?set\b/i;
var OFFRE_OCCASION = /\b(occasion|reconditionn|refurb|gebraucht|d.?occasion|\bused\b|seconde main)\b/i;
/* ⛔ LES UNITÉS NE SONT JAMAIS DES RÉFÉRENCES. Table élargie le 04/08/2026,
   puis le « x » des DIMENSIONS ajouté aux séparateurs : « SDS-max 38x570x450
   mm DT9442-QZ » comptait « 38x570x450 » comme une SECONDE référence, donc
   deux candidats, donc refus — et le foret était perdu alors que sa référence
   est écrite en toutes lettres. Une cote n'est pas un code produit.
   après avoir accepté « N233859 » (une lettre, six chiffres) : ce même
   assouplissement laissait passer « 600ML », « 250PCS », « 18GA ». Une unité
   reconnue est écartée quelle que soit la forme de la référence. */
/* ⚠️ TABLE VOLONTAIREMENT COURTE. J'y avais ajouté MAH, INCH, GALLON, WZ,
   VBL… puis mesuré qu'AUCUN sabotage ne les faisait tomber : la règle
   « une référence commence par une lettre » les couvrait déjà toutes. Une
   garde qu'on ne peut pas faire échouer ne garde rien — elles sont parties.
   Ne reste ici que ce qui peut apparaître EN TÊTE d'un candidat, donc
   derrière une lettre : « bars/500L/H ». */
var UNITES = 'PCS|BAR|PSI|RPM|MIN|MAX|KWH|KW|KG|NM|ML|AH|MM|CM|GA|PC|DB|TR|IN|FT|V|W|M|L|G|H|°';
/* ⛔ UNE COTE SE LIT PAR MORCEAUX, PAS D'UN SEUL TENANT. L'ancienne écriture
   — une seule expression régulière du début à la fin — exigeait que la chaîne
   COMMENCE par un nombre. « 160 bars/500L/H » donnait donc le candidat
   « bars/500L/H », qui commence par une lettre : elle passait au travers et
   devenait la référence de l'article. On découpe sur les séparateurs de cote
   (« - », « / », « x »), et l'expression est une cote si CHAQUE morceau est un
   nombre ou une unité — pluriel compris. Même famille de défaut qu'en E-406 :
   une règle qui décrit la forme entière rate les formes qu'on n'a pas prévues,
   là où une règle par morceau les couvre toutes. */
var UNITE_SEULE = new RegExp('^\\d*([.,]\\d+)?(' + UNITES + ')S?$', 'i');
var NOMBRE_SEUL = /^\d+([.,]\d+)?$/;
function estExpressionUnite(c) {
  var morceaux = String(c || '').split(/[-\/x×]/i).filter(Boolean);
  if (!morceaux.length) return false;
  return morceaux.every(function (m) {
    return NOMBRE_SEUL.test(m) || UNITE_SEULE.test(m);
  });
}
/* ⛔ UNE NORME N'EST PAS UNE RÉFÉRENCE. « IP56 » dans « Écouteurs Bluetooth
   37h IP56 Jaune (DXMA1902092) » comptait pour une seconde référence, donc
   deux candidats, donc refus — et l'article était perdu alors que sa référence
   est écrite entre parenthèses. Un indice de protection, une norme EN/ISO, une
   classe FFP : ce sont des CARACTÉRISTIQUES, jamais des codes produit. */
var NOTATION_NORME = /^(IP|EN|ISO|NF|DIN|ANSI|FFP|CE|SDS)\d+[A-Z]{0,2}$/;
/* ⛔ « DW616/618 » DÉSIGNE DEUX MACHINES, PAS UNE. Aucune référence DeWALT ne
   porte de barre oblique entre deux nombres — mesuré sur les 1105 fiches du
   catalogue : les seuls `/` présents séparent des COTES (350/30, D125/8), où
   le membre de droite tient sur un seul chiffre. Deux chiffres ou plus à
   droite, c'est une énumération de modèles. */
var LISTE_MODELES = /^[A-Z]*\d+(\/\d{2,})+$/;
/* Les mots qui introduisent une COMPATIBILITÉ, et rien d'autre.
   ⛔ ET ILS NE TOUCHENT PAS TOUJOURS LA RÉFÉRENCE. Mesuré le 05/08/2026 :
   « Poulie de rechange pour tondeuse à gazon DeWalt DCMW220X2 » — quatre mots
   séparent le « pour » de la machine visée, et l'ancienne borne collée à la
   fin ne voyait rien. La poulie devenait alors une seconde référence propre,
   donc deux candidats, donc refus. On accepte jusqu'à quatre mots ORDINAIRES
   entre les deux — sans chiffre, donc jamais une autre référence. */
var MOT_COMPAT = new RegExp('\\b(pour|f[üu]r|for|compatible\\s+avec|compatible'
  + '|adapt[ée]e?s?\\s+(?:[àa]|pour)|passend\\s+f[üu]r|convient\\s+(?:[àa]|pour)'
  + '|fits|de\\s+rechange\\s+pour|ersatz\\s+f[üu]r)\\s+'
  + '(?:[A-Za-zÀ-ÖØ-öø-ÿ\'’-]+\\s+){0,4}$', 'i');
/* Ce qui SÉPARE deux références de la même énumération de compatibilité :
   rien d'autre que de la ponctuation faible et un « et ». Sert à propager la
   marque de compatibilité à toute la liste — « pour DCD785, DCD985, DCF885 »
   ne cite qu'UNE fois le mot « pour ». */
var SEPARATEUR_FORT = /[.;)(]|\s[\u002D\u2013\u2014:]\s/;
var SUITE_ENUMERATION = /^[\s,;\/]*(et|and|und|y|o|ou|of)?[\s,;\/]*$/i;
/* ⛔ LES PRÉFIXES QUI DISENT « CET ARTICLE EST UN ENSEMBLE ». Vérifié le
   05/08/2026 sur les nomenclatures publiques : DCK = *DeWalt Combo Kit* — le
   premier chiffre donne même le nombre d'outils (toolguyd.com, housedigest.com) ;
   FVK = kit FLEXVOLT, dont l'annonce constructeur énumère le contenu
   (« FVK271T2-QW … DCH333 + DCG414 + 2 batteries + DCB118 », amazon.nl).
   ⚠️ CE N'EST PAS UNE LISTE DE MOTS-CLÉS : c'est la nomenclature du fabricant.
   Un titre de kit NOMME les machines qu'il contient ; sans cette règle, chaque
   machine citée comptait pour une annonce concurrente et le kit était perdu. */
var PREFIXES_KIT = /^(DCK|FVK)[0-9-]/;
/* Pièce détachée DeWALT : « N » suivi d'un numéro long. Mesuré sur le
   catalogue : deux fiches, N233859 et N510599, toutes deux des composants. */
var PIECE_DETACHEE = /^N\d{5,}$/;

/* La tête d'un candidat : ses lettres initiales. Rend vrai quand elles
   forment un préfixe que le fabricant emploie réellement — on essaie du plus
   long au plus court, sinon « DCB » masquerait « DCBP ». */
function teteConnue(c) {
  var lettres = (String(c).match(/^[A-Z]+/) || [''])[0];
  for (var n = lettres.length; n >= 2; n--) {
    /* TETES_CONNUES = union des tables de préfixes de TOUTES les marques
       traquées (DeWALT + Makita, MESURÉES depuis le catalogue). Une nouvelle
       marque s'ajoute par sa TABLE dans nomenclature.js — jamais ici (TR-009). */
    if (Object.prototype.hasOwnProperty.call(nomen.TETES_CONNUES, lettres.slice(0, n))) return true;
  }
  return false;
}

function candidatsAvecPosition(titre, brand) {
  var t = String(titre || '');
  var marqueUp = String(brand || '').toUpperCase();
  var re = /[A-Z0-9][A-Z0-9.\/-]{3,}/gi;
  var out = [], m;
  while ((m = re.exec(t)) !== null) {
    /* ⛔ LA RÉFÉRENCE COLLÉE À UN MOT PAR UN TIRET. Mesuré :
       « DT3889-QZ DT3889-QZ-Coronas de Diamante en Seco » donnait DEUX
       candidats — la référence, et la même suivie de « -CORONAS ». Deux
       candidats ⇒ refus, et le disque était perdu alors que sa référence est
       écrite deux fois. On retire le dernier segment quand il ne porte AUCUN
       chiffre : un segment sans chiffre est un mot, jamais un code.
       ⚠️ ET ÇA SE FAIT AVANT TOUT LE RESTE, sur le texte TEL QU'ÉCRIT. Défaut
       mesuré le 05/08/2026 : « D215852-XJ-ramasseur D215851 eau » — le mot
       collé était en minuscules, la garde de capitales jetait donc la
       référence ENTIÈRE, et l'annonce se rattachait à la mauvaise. */
    var brut = m[0].replace(/-[A-Za-z]{3,}$/, function (seg) {
      return /\d/.test(seg) ? seg : '';
    });
    /* Et le mot peut être collé SANS TIRET, la capitale servant de soudure :
       « dwd024Puissance 650W » — mesuré le 05/08/2026. On ne retire que ce qui
       ressemble à un mot, et jamais si le reste perd ses chiffres.
       ⛔ CINQ SIGNES AU MINIMUM, ET C'EST UNE BORNE PAYÉE. À trois, la garde
       mangeait le « Lrt » de « Dcg406P2Lrt » — or DCG406P2LRT-QW est une
       référence CONSTRUCTEUR (meuleuse XR 125 mm LANYARD READY, publiée sur
       cee.dewalt.global). Un suffixe DeWALT tient en quatre signes ; un mot de
       la langue, non. */
    brut = brut.replace(/(?!^)[A-Z][a-z]{4,}$/, '');
    if (brut.length < 4 || !/\d/.test(brut)) brut = m[0];
    var c = brut.toUpperCase();
    if (c === marqueUp) continue;
    /* ⛔ DEUX FORMES DE RÉFÉRENCE, ET LA SECONDE MANQUAIT. « DCB117-QW » a
       deux lettres ; « N233859 » — une pièce détachée montrée par l'user —
       n'en a QU'UNE, suivie de six chiffres, et c'est une référence DeWALT
       parfaitement valide. Exiger deux lettres la jetait.
       ⚠️ Le seuil de quatre chiffres évite qu'un « 600ML » ou un « L120 »
       passe pour une référence : une lettre seule ne suffit que si elle est
       suivie d'un numéro long. */
    var nbLettres = (c.match(/[A-Z]/g) || []).length;
    var nbChiffres = (c.match(/\d/g) || []).length;
    /* ⛔⛔ UNE RÉFÉRENCE PEUT N'AVOIR AUCUN CHIFFRE. Mesuré le 08/08/2026 sur
       une capture de l'user : « Aspirateur Eau & Poussières Dxvp-qt - 960w,
       34l, Silencieux » — DXVP-QT est la référence constructeur, et le
       catalogue la porte. Elle est la SEULE des 1078 fiches DeWALT à ne pas
       contenir de chiffre, et cette garde la jetait : aucun candidat, aucune
       lecture, l'aspirateur restait hors du traqueur.
       ⚠️ ET ON NE LÈVE PAS LA GARDE, ON LA CONDITIONNE. Sans chiffre, « EAU »,
       « SILENCIEUX » ou « SDS-MAX » deviendraient des références. Un candidat
       sans chiffre n'est donc accepté que si sa TÊTE est un préfixe
       CONSTRUCTEUR connu — la nomenclature tranche, pas la forme.
       ⛔⛔ ET IL LUI FAUT UN TIRET. Première version, sans cette condition :
       37 références se sont retrouvées TRONQUÉES à leur seul préfixe, mesuré
       sur le balayage — « DeWalt DCBP 034 E3 » donnait « DCBP », « DXPW 002CE »
       donnait « DXPW ». Le préfixe nu devenait un candidat, le recollage ne
       partait donc plus, et la référence était perdue au profit d'une famille
       entière. Un préfixe SEUL n'est jamais une référence ; « DXVP-QT » en est
       une, et son tiret est ce qui les sépare. */
    if (!nbChiffres && !(teteConnue(c) && c.indexOf('-') !== -1)) continue;
    if (nbLettres < 2 && !(nbLettres === 1 && nbChiffres >= 4)) continue;
    if (estExpressionUnite(c)) continue;                      // « 18V-54V » n'est pas une réf
    if (NOTATION_NORME.test(c)) continue;                     // « IP56 », « EN388 »
    if (LISTE_MODELES.test(c)) continue;                      // « DW616/618 » = deux machines
    /* ⛔⛔ UNE RÉFÉRENCE DeWALT COMMENCE PAR DES LETTRES, SANS EXCEPTION.
       Mesuré sur les 1105 fiches DeWALT du catalogue : aucune n'ouvre sur un
       chiffre — les trois « 350/30 », « 355/25 », « D125/8 » qui portent une
       barre oblique sont des COTES de lame, pas des codes.
       Ce qui commence par un chiffre est donc une quantité, une cote ou un
       morceau de référence coupé : « 11-piece », « 3-en-1 », « 341-tlg. »,
       « 9.9kSt. », « 9000tr/min », « 59mm- », « 12xDT71516M », « 305X30 »,
       et surtout « 334M1 », « 002CE » — des références AMPUTÉES de leur tête
       (« DCS 334M1 », « DXPW 002CE ») que le recollage sait reconstituer.
       ⚠️ PREMIÈRE VERSION, PLUS TIMIDE : la garde n'écartait que les mots
       portant aussi des minuscules. Elle laissait « 334M1 » et « 002CE »
       devenir des références à part entière, et elle obligeait à décrire une
       à une les unités écrites en capitales. Une seule règle nette remplace
       les cinq précédentes.
       ⚠️ ET LA RÈGLE NE VA PAS PLUS LOIN QUE ÇA. Première version essayée le
       05/08/2026 : « tout candidat portant une minuscule est écarté ». Elle a
       coûté 53 lectures justes en une passe — « Dcs16150 », « Dw0521 »,
       « dnf25r50e », « dt20736b/qz », « Dcg418Shdx2 » sont de VRAIES
       références, simplement mises en casse de titre par le marchand. */
    if (/^\d/.test(brut)) continue;
    if (out.some(function (x) { return x.ref === c; })) continue;
    out.push({ ref: c, ecrit: brut, index: m.index, fin: m.index + brut.length });
  }
  /* ⛔ QUAND LES DEUX COEXISTENT, LES CAPITALES L'EMPORTENT. « DEWALT
     DNBT1850SZ - Puntas Brad 1,25mm x 50mm 18GA Acero inox316 » : la référence
     est écrite en capitales, « inox316 » ne l'est pas. C'est une règle
     RELATIVE, et elle doit le rester — un marchand qui met TOUT en casse de
     titre écrit quand même sa référence, et « DeWALT Dcs16150 … » n'a alors
     aucun candidat en capitales à lui opposer. */
  var enCapitales = out.filter(function (a) { return !/[a-z]/.test(a.ecrit); });
  return enCapitales.length ? enCapitales : out;
}

/* Les tranches de texte où le marchand ÉNUMÈRE LE CONTENU d'un ensemble, et
   non des produits vendus côte à côte. Deux formes, toutes deux structurelles :
     · une parenthèse qui contient un « + » — « DCK2223MP2T (DCD86M+DCG45M) » ;
     · tout ce qui suit un « = » — « CPROF367 - KIT = D21583K + DT9762 ».
   ⛔ CE QUE ÇA CHANGE, ET POURQUOI C'EST JUSTE : un kit porte SA PROPRE
   référence et se vend à SON prix. Le « + » de son contenu n'en fait pas un
   assemblage de deux annonces. Le « + » resté À L'AIR LIBRE, lui, continue de
   valoir refus — c'est lui qui signalait « Power Set 1×18V 5,0 Ah + DCB107 ».
   Rend une liste d'intervalles [début, fin[ dans le titre d'origine. */
function tranchesDeContenu(titre) {
  var t = String(titre || ''), zones = [], m;
  var re = /\([^()]*\)/g;
  while ((m = re.exec(t)) !== null) {
    if (/[+]/.test(m[0])) zones.push([m.index, m.index + m[0].length]);
  }
  var eg = t.search(/(?:^|\s)=\s/);
  if (eg !== -1) zones.push([eg, t.length]);
  return zones;
}
function dansUneTranche(zones, i) {
  return zones.some(function (z) { return i >= z[0] && i < z[1]; });
}

/* ⛔⛔ LE « + » NE DIT PAS LA MÊME CHOSE SELON CE QU'IL Y A CONTRE LUI.
   Défaut mesuré le 05/08/2026 : cinq articles étaient refusés à tort —
   « DCB112D2 Pack de batteries … 2 batteries + Chargeur DCB112 »,
   « Kit 2 outils … Perceuse + Gonfleur - DCK2067D2T-QW »,
   « Pack 2 batteries bluetooth 18V 2Ah + Adapt USB - DCB283BC »,
   « Combo Kit + 2 x 5.0Ah (DCK2026P2T-QW) », « … 2x 5,0 Ah + Ladegerät ».
   Dans tous, le « + » énumère CE QUE CONTIENT l'article, qui a sa référence.
   ⛔ CE QUI RESTE INTERDIT, et que cette règle continue d'attraper : deux
   produits DISTINCTS accolés, chacun avec sa référence — « … DT2296-QZ +
   DEWALT Scie Sauteuse … », « Power Set 1×18V 5,0 Ah + DCB107 ». Le signe
   distinctif est STRUCTUREL et mesurable : dans un assemblage, une référence
   TOUCHE le jointeur ; dans un contenu, il n'y a que de la prose contre lui.
   Rend vrai quand une référence est collée à un « + » ou « & » de premier
   niveau — seuls des espaces, tirets ou deux-points peuvent s'intercaler. */
var COLLE_AU_JOINTEUR = /^[\s\-–—:]*$/;
function assemblageDeProduits(titre, cands, zones) {
  var t = String(titre || ''), re = /\s[+&]\s/g, m;
  while ((m = re.exec(t)) !== null) {
    var g = m.index, d = m.index + m[0].length;
    if (dansUneTranche(zones, g)) continue;
    var colle = cands.some(function (c) {
      if (c.fin <= g) return COLLE_AU_JOINTEUR.test(t.slice(c.fin, g));
      if (c.index >= d) return COLLE_AU_JOINTEUR.test(t.slice(d, c.index));
      return false;
    });
    if (colle) return true;
  }
  return false;
}

/* Rend { ref, pourMachines } — `ref` est la référence PROPRE de l'article,
   `pourMachines` la liste de celles qu'il dit servir. `ref` vaut null quand
   rien ne peut être tranché sans deviner. */
function lireReferenceDuTitre(titre, brand) {
  var t = String(titre || '');
  var vide = { ref: null, pourMachines: [], contient: [] };
  if (!t) return vide;
  if (OFFRE_OCCASION.test(t)) return vide;
  /* Le jointeur se juge HORS des tranches de contenu : « (DCH333 + DCG418) »
     décrit ce qu'il y a dans le coffret, pas deux annonces accolées. */
  var zones = tranchesDeContenu(t);
  if (OFFRE_LOT.test(t)) return vide;                     // « Power Set … »
  var cands = candidatsAvecPosition(t, brand);
  if (assemblageDeProduits(t, cands, zones)) return vide;
  /* ⛔ SECONDE LECTURE : LA RÉFÉRENCE ÉCRITE AVEC UNE ESPACE. Mesuré le
     04/08/2026 : « DEWALT-fraise à carotter HSS 40 mm » porte la référence
     HSS40, coupée en deux par le marchand. Aucune passe stricte ne peut la
     voir. On la recolle — mais SEULEMENT si rien n'a été trouvé autrement,
     pour ne pas fabriquer un second candidat là où il y en avait déjà un.
     ⛔⛔ ET JAMAIS UN NOM DE GAMME. « Souffleur Brushless XR 18V 5Ah »
     donnerait « XR18V », qui n'est pas une référence mais la gamme suivie du
     voltage. Écrire un prix dessus rattacherait n'importe quel outil XR au
     même article. Les gammes connues sont refusées d'office. */
  function recoller() {
    /* Le suffixe peut être séparé lui aussi : « DCS 355 D2 ». On l'accepte,
       mais jamais si c'est une UNITÉ — « HSS 40 MM » ne donne pas HSS40MM. */
    /* ⛔⛔ LE PRÉFIXE DOIT ÊTRE EN MAJUSCULES DANS LE TITRE D'ORIGINE.
       Défaut attrapé par la porte : en cherchant sur le titre mis en
       majuscules, « bidon 600ML de graisse » donnait « BIDON600 ». N'importe
       quel mot suivi d'un nombre devenait une référence. Une vraie référence
       est ÉCRITE en capitales par le marchand — c'est ce qui la distingue
       d'un mot ordinaire. On cherche donc sur le texte TEL QUEL. */
    var re2 = /\b([A-Z]{2,5})\s+(\d{2,5})\s*([A-Z][A-Z0-9-]{0,5})?\b/g, m2;
    while ((m2 = re2.exec(t)) !== null) {
      var tete = m2[1];
      if (SERIES.indexOf(tete.toLowerCase()) !== -1) continue;   // XR, FLEXVOLT…
      if (tete === String(brand || '').toUpperCase()) continue;
      if (/^(EN|ISO|NF|CE|FFP|DIN|ANSI|SDS|IP)$/.test(tete)) continue;
      var queue = m2[3] || '';
      if (queue && /^(MM|CM|M|V|W|KW|AH|NM|KG|G|ML|L|PCS|PC|GA|MIN|H|BAR|PSI|RPM|TR|DB|IN|FT|MAX|SET|KIT|LOT)$/.test(queue)) queue = '';
      return { ref: tete + m2[2] + queue, index: m2.index,
        fin: m2.index + m2[0].length, ecrit: (tete + m2[2] + queue), recolle: true };
    }
    return null;
  }

  var propres = [], compat = [], contenu = [], precedent = null;
  function classer(c) {
    /* Les 60 signes qui précèdent, bornés à la ponctuation forte : un
       « pour » d'une autre proposition ne doit pas mordre ici. La virgule
       n'est PAS une borne — elle sépare les membres d'une même énumération. */
    var avant = t.slice(Math.max(0, c.index - 60), c.index);
    /* ⛔ ET LE TIRET DE SÉPARATION BORNE AUSSI. « Support powershift pour
       carotteuse - DEWALT - DCPS151-XJ » : après le tiret, le marchand écrit
       SA référence, pas la machine visée. Sans cette borne, le « pour » du
       début mordait jusqu'au bout du titre et l'article était perdu. */
    avant = avant.split(SEPARATEUR_FORT).pop();
    var estCompat = MOT_COMPAT.test(avant);
    /* ⛔⛔ UNE PIÈCE DÉTACHÉE N'EST JAMAIS LA MACHINE VISÉE. Mesuré le
       08/08/2026 : « Barre pour scie Stationnaire DeWALT N233859 » — la barre
       coûte 82,99 €, et le « pour » la faisait passer pour la scie. Elle
       restait donc hors du traqueur.
       DeWALT numérote ses pièces détachées « N » suivi d'un long numéro ; ce
       sont des composants, jamais des machines qu'un accessoire équiperait.
       Une référence de cette forme est donc l'ARTICLE, quoi qu'il y ait devant.
       ⚠️ Ce n'est pas un assouplissement du « pour » : les machines citées
       après lui restent compat. Seule la forme N+numéro échappe, parce qu'elle
       ne peut pas désigner une machine. */
    if (estCompat && PIECE_DETACHEE.test(c.ref)) estCompat = false;
    /* ⛔ « pour DCD785, DCD985, DCF885 » NE DIT « pour » QU'UNE FOIS. Sans
       propagation, les deux suivantes passaient pour des références propres —
       trois candidats, refus, et la batterie DCB183 était perdue. Une liste ne
       se rompt que sur autre chose qu'une ponctuation faible ou un « et ». */
    if (!estCompat && precedent && precedent.compat
      && SUITE_ENUMERATION.test(t.slice(precedent.fin, c.index))) estCompat = true;
    var estContenu = dansUneTranche(zones, c.index);
    precedent = { fin: c.fin, compat: estCompat };
    if (estCompat) compat.push(c.ref);
    else if (estContenu) contenu.push(c.ref);
    else propres.push(c.ref);
  }
  cands.sort(function (a, b) { return a.index - b.index; });
  cands.forEach(classer);
  /* ⛔⛔ LE RECOLLAGE SE DÉCLENCHE SUR L'ABSENCE DE RÉFÉRENCE PROPRE, PAS SUR
     L'ABSENCE DE CANDIDAT. Défaut mesuré le 05/08/2026 :
     « DeWalt DCS 331P1 (1 x 5,0 Ah + DCB115 + TSTAK II) » — la seule chose que
     la passe stricte trouve est DCB115, qui est du CONTENU. Il restait donc un
     candidat, le recollage ne partait pas, et la machine était perdue alors
     que sa référence est écrite en toutes lettres, à une espace près. */
  if (!propres.length) {
    var recolle = recoller();
    if (recolle) { cands.push(recolle); classer(recolle); }
  }
  if (!cands.length) return vide;
  /* ⛔ LA MÊME RÉFÉRENCE ÉCRITE DEUX FOIS, EN COURT ET EN LONG. Mesuré :
     « Pack de 6 chargeurs DeWALT DCB1104-6 (DCB1104 - 12V 18V) »,
     « DCB112D2 … + Chargeur DCB112 », « DCHJ080B-XL DCHJ080B Sweat … »,
     « DT70523TM-QZ-Expositor Merchandiser DT70523T x 12 ». Le marchand cite
     le modèle PUIS sa déclinaison ; ce n'est pas deux produits, c'en est un.
     C'est la règle de l'user, mot pour mot : « si la référence est la même au
     début, on a qu'une seule carte produit ». On garde la PLUS PRÉCISE.
     ⛔⛔ ET SEULEMENT ENTRE RÉFÉRENCES PROPRES. Défaut attrapé par la porte le
     05/08/2026 : appliqué à TOUS les candidats, le repli avalait la machine
     visée — « Tête d'outil … pour ZZE4500 (ZZE450078) » perdait ZZE4500, et
     l'accessoire ne disait donc plus à quoi il sert. Une machine compatible
     n'est pas l'écriture abrégée de l'article : les deux listes vivent à part. */
  propres = propres.filter(function (a) {
    return !propres.some(function (b) {
      return b !== a && b.length > a.length && b.indexOf(a) === 0;
    });
  });
  /* ⛔ « DCK » VEUT DIRE KIT — *DeWalt Cordless Kit*. Un titre de kit nomme
     les machines qu'il contient : « DCK266NT Perceuse (DCD796) Visseuse
     (DCF887) ». Les machines citées ne sont pas des annonces concurrentes,
     elles sont le CONTENU, et le prix affiché est celui du kit. Quand une
     seule référence porte un préfixe de kit et que les autres n'en portent
     pas, c'est elle l'article — les autres deviennent son contenu.
     ⚠️ La compatibilité passe AVANT : un accessoire « pour DCK266 » n'est
     jamais un kit, il a déjà été écarté ci-dessus. */
  if (propres.length > 1) {
    var kits = propres.filter(function (r) { return PREFIXES_KIT.test(r); });
    if (kits.length === 1) {
      contenu = contenu.concat(propres.filter(function (r) { return r !== kits[0]; }));
      propres = kits;
    }
  }
  if (propres.length !== 1) return { ref: null, pourMachines: compat, contient: contenu };
  return { ref: propres[0], pourMachines: compat, contient: contenu };
}

/* Compatibilité d'appel : l'ancienne forme ne rendait que la référence. */
function refUniqueDuTitre(titre, brand) {
  return lireReferenceDuTitre(titre, brand).ref;
}

function parseIdealo(rawText, brand) {

  var out = [];
  var ecartes = [];
  var perdus = [];
  if (!rawText) return { items: out, sansRef: ecartes, perdus: perdus };
  brand = (brand || 'DEWALT');
  var lignes = stripHtml(rawText).split(/\n+/).map(function (l) {
    return l.replace(/[ \t   ]+/g, ' ').trim();
  }).filter(Boolean);

  var FIN_PRODUIT = /^d[\u00e9e]tails\s+du\s+produit$/i;
  var FIN_OFFRE   = /^d[\u00e9e]tails\s+de\s+l[\u2019']?offre$/i;
  var VENDU_PAR   = /^vendu\s+par\s*:/i;
  /* ⛔⛔ L'ANCRE QUI MANQUAIT — ET AVEC ELLE, UNE TUILE PAR PAGE.
     L'user : « il y a 60 cartes produits avec 60 prix et les 60 sont
     cliquables ». J'en lisais 59 et mes deux compteurs disaient « rien ne
     manque » : ils ne pouvaient pas voir celle-là. Une tuile-FICHE ne
     s'ouvrait que sur un titre commençant par « MARQUE RÉF » ; quand idealo
     écrit « Meuleuse compacte 125 mm - DEWALT - DCG404S2T-QW », la tuile
     entière est avalée par sa voisine — invisible dans `items`, dans
     `sansRef`, dans `perdus` ET dans `refsVues` (le motif y cherche la marque
     SUIVIE de la réf, or ici un tiret les sépare).
     Reproduit : trois tuiles d'affilée, la deuxième au titre sans marque en
     tête → 2 lues sur 3, et 693,49 € perdus sans une trace.
     ⛔ Or chaque tuile-fiche s'annonce elle-même : « 12 offres » puis
     « à partir de X € ». C'est un COMPTE suivi d'un PRIX — la page ne peut pas
     ne pas les écrire, contrairement à un libellé d'interface (E-309). On
     ferme donc la tuile sur son prix, et la suivante démarre propre.
     ⚠️ J4 : une tuile perdue est un prix perdu. Le coût d'achat retenu est le
     MINIMUM des sources ; en manquer une, c'est retenir un coût trop haut. */
  var NB_OFFRES   = /^\d+\s+offres?\b/i;
  // Titre : la marque, puis la r\u00e9f en PREMIER mot. Ce qui suit est ignor\u00e9.
  var titreRe = new RegExp('^' + escapeRe(brand) + '\\s+([A-Z0-9][A-Z0-9.\\/-]*[A-Z0-9])\\b', 'i');
  // Prix : \u00ab \u00e0 partir de X,XX \u20ac \u00bb OU un montant seul (cas \u00ab 1 offre \u00bb).
  var prixApartir = /\u00e0\s*partir\s*de\s*([\d\s   ]*\d,\d{2})\s*\u20ac/i;
  var prixSeul    = /^([\d\s   ]*\d,\d{2})\s*\u20ac$/;
  /* \u26d4\u26d4 UN TOTAL S'\u00c9CRIT EN T\u00caTE DE LIGNE, DES FRAIS S'ANNONCENT PAR LEUR
     \u00c9TIQUETTE. C'est la seule chose qui s\u00e9pare \u00ab 691,53 \u20ac TVA incluse \u00bb de
     \u00ab Frais de port : 3,23 \u20ac \u00bb sans recopier une formulation \u2014 et donc la
     seule qui tienne dans les trois langues de ses pages. */
  var MONTANT_EN_TETE = /^[\d\s   ]*\d,\d{2}\s*\u20ac/;

  /* \u26a0\ufe0f \u00ab D\u00e9tails de l'offre \u00bb appara\u00eet DEUX fois par offre (apr\u00e8s le vendeur,
     puis apr\u00e8s le prix). Couper dessus hachait le bloc et faisait passer une
     ligne de d\u00e9lai \u2014 \u00ab 24/48 heures \u00bb \u2014 pour un titre de produit. On m\u00e9morise
     donc le titre au moment o\u00f9 \u00ab Vendu par : \u00bb le d\u00e9signe : c'est la ligne
     juste avant, et elle seule. */
  /* ⛔⛔ NE JAMAIS FAIRE DÉPENDRE UN DÉCOUPAGE D'UNE ÉTIQUETTE D'INTERFACE.
     Payé le 03/08/2026 : le relevé de l'user est revenu `parsed: 0`,
     `format: "aucun"` sur une page qui contenait 57 références. Cause MESURÉE
     en retirant la seule ligne « Détails du produit » du corpus réel — les
     3 produits lus deviennent 0, et le format devient « aucun ». Idealo ne
     l'avait pas envoyée ce jour-là ; sans elle le bloc n'était jamais vidé, et
     un seul appel avait lieu, en toute fin de texte.

     UNE CARTE S'ANNONCE ELLE-MÊME : sa première ligne est « MARQUE RÉF ».
     C'est cette ligne, et non un libellé d'affichage, qui ouvre une carte et
     clôt la précédente. Les deux ancres d'origine restent en RENFORT — elles
     servent encore aux offres marchandes — mais plus rien ne dépend d'elles
     seules. Une règle de secours ne coûte rien ; son absence a coûté un
     relevé entier. */
  var bloc = [], seen = {}, titreOffre = null, vuNbOffres = false, vuVenduPar = false;
  for (var i = 0; i < lignes.length; i++) {
    var l = lignes[i];
    if (VENDU_PAR.test(l)) {
      vuVenduPar = true;
      // ⚠️ Retenu AVANT d'écraser : c'est lui qui possède la queue qui traîne.
      var titrePrecedent = titreOffre;
      titreOffre = (bloc.length ? bloc[bloc.length - 1] : null) || titreOffre;
      /* ⛔ « Vendu par : » désigne le titre juste au-dessus — donc TOUT ce qui
         précède ce titre appartient à la carte d'avant, et doit être traité
         comme telle. Mesuré le 03/08 sans les ancres : la carte qui précédait
         une offre marchande était avalée par l'offre et perdue (2 produits lus
         au lieu de 3). On coupe ici, le titre de l'offre restant seul. */
      /* ⛔⛔ CE QUI PRÉCÈDE N'EST PAS TOUJOURS UNE CARTE. Défaut trouvé le
         03/08 grâce à `refsNonLuesDetail`, et reproduit à l'identique : idealo
         n'écrit plus qu'UNE ancre par offre, juste après « Vendu par ». La
         queue d'une offre — délai · livraison · prix — traîne donc jusqu'au
         titre suivant. Quand ce titre ne commence PAS par la marque
         (« Meuleuse … - DEWALT - DCG404S2T-QW »), rien ne coupe avant, et
         c'est ICI que la coupe se fait. En passant `false`, j'envoyais la
         queue de l'offre précédente dans le chemin des CARTES, où elle n'a ni
         référence ni prix lisible : cinq annonces perdues par relevé, avec
         LEUR PRIX. Si un titre d'offre était en attente, la queue lui
         appartient — `titrePrecedent` le dit.
         ⚠️ J4 : on ne fabrique aucun prix, on rend son prix à l'annonce qui
         l'a réellement affiché. */
      if (bloc.length > 1) {
        var gardeTitre = titreOffre;
        titreOffre = titrePrecedent;                   // la queue appartient à LUI
        traiter(bloc.slice(0, bloc.length - 1), !!titrePrecedent);
        titreOffre = gardeTitre;                       // puis on rend la main au nouveau
        bloc = [bloc[bloc.length - 1]];
      }
    }
    if (FIN_PRODUIT.test(l) || FIN_OFFRE.test(l)) {
      traiter(bloc, FIN_OFFRE.test(l) || !!titreOffre);
      if (FIN_PRODUIT.test(l)) titreOffre = null;
      bloc = [];
      continue;
    }
    // Nouvelle carte : on ferme celle qui précède AVANT d'empiler ce titre.
    if (bloc.length && estTitreCarte(l)) {
      traiter(bloc, !!titreOffre);
      titreOffre = null;
      bloc = [];
    }
    bloc.push(l);
    /* ⛔⛔ UNE TUILE-FICHE SE FERME SUR SON PRIX — sinon la suivante n'existe
       pas. Tant qu'un titre commençait par « MARQUE RÉF », la tuile suivante
       ouvrait le bloc et tout allait bien. Mais idealo écrit aussi
       « Meuleuse compacte 125 mm - DEWALT - DCG404S2T-QW » : plus de marque en
       tête, donc plus d'ouverture, donc la tuile ENTIÈRE est avalée par sa
       voisine — invisible partout, prix compris.
       ⛔ On s'ancre sur ce que la page ne peut PAS ne pas écrire : le compte
       d'offres puis le prix. Deux lignes, dans cet ordre, et jamais un libellé
       d'interface (la leçon de E-309). Le compte seul ne ferme rien : c'est le
       PRIX qui clôt, parce que c'est lui qu'on est venu chercher. */
    if (NB_OFFRES.test(l)) vuNbOffres = true;
    else if (vuNbOffres && (prixApartir.test(l) || prixSeul.test(l))) {
      traiter(bloc, !!titreOffre);
      titreOffre = null;
      vuNbOffres = false;
      bloc = [];
      continue;
    }
    /* ⛔⛔ ARGENT — UNE ANNONCE SE FERME AUSSI SUR SON PRIX. Trouvé en
       éprouvant une page mixte reconstituée : la DERNIÈRE annonce, que rien
       ne fermait, avalait le bandeau « Produits favoris » et ressortait à
       784,99 € — LE PRIX DE L'iPHONE — au lieu de ses 695,00 €. La recherche
       de prix d'une annonce remonte depuis la fin du bloc ; sans borne, cette
       fin n'est plus la sienne. C'est le même défaut que le téléphone posé
       sur une scie (E-309), resté vivant sur l'autre chemin.
       ⛔⛔ MAIS PAS SUR N'IMPORTE QUEL PRIX — ET J'AI PAYÉ CETTE NUANCE.
       Premier jet : « le premier prix rencontré clôt la tuile ». Mesuré sur
       SON relevé suivant : DOUZE annonces sur trente-deux sont ressorties à
       3,23 €, 9,95 €, 8,00 €, 18,50 € — LES FRAIS DE PORT. Idealo écrit
       « Frais de port : 3,23 € » AVANT « 691,53 € TVA incluse », et je
       fermais sur le premier. Un coût d'achat de 3 € au lieu de 691 € ne
       fausse pas un prix de vente, il le détruit.
       ⛔ La règle n'est pas une liste de formulations — j'ai déjà payé
       celle-là aussi (E-309 : on ne s'ancre jamais sur un libellé). Elle est
       STRUCTURELLE : **un total s'écrit en tête de ligne, des frais
       s'annoncent d'abord par leur étiquette**. « 691,53 € TVA incluse »
       commence par son montant ; « Frais de port : 3,23 € » commence par un
       mot. Ça vaut dans les trois langues de ses pages, et ça ne périme pas.
       ⚠️ J4 : le prix retenu doit être celui de l'article, exact et complet —
       des frais de port pris pour un prix d'article ne sont ni l'un ni
       l'autre. */
    else if (vuVenduPar && MONTANT_EN_TETE.test(l)) {
      traiter(bloc, true);
      titreOffre = null;
      vuVenduPar = false;
      bloc = [];
      continue;
    }
    /* ⛔⛔ LE GARDE-FOU MANGEAIT LA DERNIÈRE CARTE DE CHAQUE PAGE.
       `shift()` retire bloc[0] — c'est-à-dire LE TITRE. Tant qu'une carte est
       suivie d'une autre, son bloc se ferme tôt et personne ne le voit. Mais
       la DERNIÈRE carte de la page n'est fermée par rien : son bloc avale la
       pagination, « Produits favoris », le pied de page… et au-delà de 40
       lignes son titre est éjecté. Elle devient un bloc sans référence, et sa
       réf ressort « vue mais non lue ».
       Mesuré sur SA page du 03/08 (`D25899K`, marteau de démolition à
       633,59 €) et reproduit en faisant varier la seule longueur de la queue :
       36 lignes après le titre → lu ; 37 → PLUS RIEN. Le défaut ne tenait à
       rien d'autre qu'au nombre de lignes du pied de page.
       ⚠️ J4 : le danger n'est pas seulement la perte. Titre éjecté, le bloc
       tombe dans le chemin sans référence et va chercher un prix plus bas —
       celui du bandeau « Produits favoris », un TÉLÉPHONE. Un prix d'iPhone
       sur un marteau, c'est un coût d'achat faux, donc un prix de vente faux.
       ⛔ Deux fenêtres, parce que deux besoins opposés : un bloc QUI A DÉJÀ SON
       TITRE n'a plus rien à gagner de ce qui suit — le titre et son prix sont
       derrière nous, on cesse d'empiler. Un bloc SANS titre est une queue
       d'offre : là c'est le plus RÉCENT qu'il faut garder, donc on glisse. */
    if (bloc.length > 40) {
      if (estTitreCarte(bloc[0])) bloc.pop();   // fenêtre FIGÉE : le titre ne part jamais
      else bloc.shift();                        // fenêtre GLISSANTE : on garde le plus récent
    }
  }
  traiter(bloc, !!titreOffre);            // dernier bloc, sans ancre finale

  /* Une ligne n'ouvre une carte que si elle porte une RÉF CRÉDIBLE — mêmes
     conditions que le typage plus bas. ⚠️ Un titre d'offre marchande porte sa
     marque à la FIN (« … 1 chargeur DEWALT ») : il ne peut donc pas déclencher
     de coupure ici, et les offres restent entières. */
  /* ⛔ TROIS PREUVES POSSIBLES, UNE SEULE SUFFIT — mais il en faut une.
     ① la marque est écrite ; ② un type d'article est reconnu (dans n'importe
     laquelle des trois langues) ; ③ une référence crédible est présente.
     « 3 à 6 jours ouvrés » n'en a aucune. « Borne de recharge murale » n'a pas
     la marque et n'a pas de réf, mais son TYPE est reconnu : elle passe, et
     c'est voulu — le comparateur liste aussi des articles hors marque. */
  function titrePlausible(ligne) {
    var s = String(ligne || '').trim();
    if (s.length < 6) return false;
    if (new RegExp(escapeRe(brand), 'i').test(s)) return true;
    if (typerTitre(s.toLowerCase())) return true;
    var refs = s.match(/\b[A-Z][A-Z0-9]{2,}(?:[-\/.][A-Z0-9]+)*\b/g) || [];
    for (var i = 0; i < refs.length; i++) {
      var r = refs[i].toUpperCase();
      if (/\d/.test(r) && r.length >= 5 && !UNITE_RE.test(r)) return true;
    }
    return false;
  }

  function estTitreCarte(ligne) {
    var m = ligne.match(titreRe);
    if (m) {
      var cand = m[1].toUpperCase();
      if (/\d/.test(cand) && cand.length >= 4 && !UNITE_RE.test(cand)) return true;
    }
    /* Réf ÉCLATÉE par des espaces (« DeWalt DCS 579 T2T ») : elle ne donnera
       jamais un `sku` — on ne devine pas un recollage — mais elle ouvre bien
       une carte. Sans ça, et sans les ancres, ces cartes étaient absorbées par
       leur voisine et disparaissaient même de la liste des écartées : mesuré,
       4 offres listées tombaient à 2. Une carte perdue n'est pas une erreur
       d'argent, mais c'est une information que l'user ne voit plus. */
    return new RegExp('^' + escapeRe(brand) + '\\s+[A-Z]{2,5}\\s+\\d{2,4}\\b', 'i').test(ligne);
  }

  /* ⛔⛔ AUCUN BLOC PORTANT UN PRIX NE DISPARAÎT EN SILENCE. Cinq références
     sont ressorties « non lues » sur SA page le 03/08, et je n'ai pas pu dire
     pourquoi : le parseur les avait écartées sans laisser de trace. C'est le
     même défaut que le `parsed: 0` muet du 01/08 et que le refus muet du
     02/08 — à chaque fois, le remède a été de MESURER au lieu de jeter.
     Tout bloc qui contient un prix et ne produit ni carte ni annonce est
     désormais consigné, avec sa raison et ses premières lignes. */
  function noter(b, raison, force) {
    if (perdus.length >= 25) return;                 // borne : on informe, on n'inonde pas
    /* ⚠️ `force` sert aux CARTES : une carte porte une RÉFÉRENCE, et c'est
       exactement elle qui ressort dans `refsNonLues`. La consigner même sans
       prix ferme la boucle — sinon la réf apparaît « vue mais non lue » sans
       qu'aucune trace n'explique pourquoi. Pour les blocs sans référence, on
       exige un prix : sans lui, rien n'était à gagner. */
    if (!force) {
      var aPrix = b.some(function (x) { return /\d,\d{2}\s*€/.test(x); });
      if (!aPrix) return;
    }
    perdus.push({
      raison: raison,
      lignes: b.slice(0, 4).map(function (x) { return String(x).slice(0, 90); })
    });
  }

  function traiter(b, estOffre) {
    if (!b.length) return;
    /* Une offre marchande se reconna\u00eet \u00e0 \u00ab Vendu par : \u00bb \u2014 et ses titres sont
       des lots. On la LISTE au lieu de la deviner. */
    if (estOffre || b.some(function (x) { return VENDU_PAR.test(x); })) {
      var titre = titreOffre || '';
      var px = null;
      /* \u26d4\u26d4 ARGENT \u2014 ON NE RAMASSE PAS N'IMPORTE QUEL MONTANT. Ce motif-ci
         acceptait \u00ab Frais de port : 3,23 \u20ac \u00bb aussi bien que \u00ab 691,53 \u20ac TVA
         incluse \u00bb : sur SON relev\u00e9, douze annonces sur trente-deux sont
         sorties avec leurs frais de port en guise de prix d'article. M\u00eame
         r\u00e8gle structurelle qu'\u00e0 la fermeture de tuile \u2014 un total commence par
         son montant, des frais commencent par leur \u00e9tiquette.
         \u26a0\ufe0f Aucun repli vers \u00ab n'importe quel prix \u00bb : se rabattre sur les
         frais de port serait pr\u00e9cis\u00e9ment le d\u00e9faut. Sans montant en t\u00eate, il
         n'y a pas de prix, et le bloc part au registre des pertes avec sa
         raison. Un vide se voit ; un prix faux se propage. */
      for (var k = b.length - 1; k >= 0; k--) {
        var m = b[k].match(/^([\d\s   ]*\d,\d{2})\s*\u20ac/);
        if (m) { px = parsePriceFR(m[1]); break; }
      }
      /* \u26d4\u26d4 ARGENT \u2014 UN TITRE FAUX AVEC UN PRIX DESSUS EST PIRE QU'UN VIDE.
         Trouv\u00e9 dans SON relev\u00e9 du 03/08 : l'annonce \u00ab 3 \u00e0 6 jours ouvr\u00e9s \u00bb
         sortait avec un prix de 674 \u20ac. Un D\u00c9LAI DE LIVRAISON pris pour un nom
         de produit \u2014 et un co\u00fbt d'achat qui, adopt\u00e9, ne correspondrait \u00e0
         RIEN. Une garde existait, mais elle listait des formulations
         (\u00ab 24/48 \u00bb, \u00ab Livraison \u00bb) : un site en \u00e9crit dix autres.
         \u26d4 On ne blackliste plus des phrases \u2014 on exige que le titre soit
         PLAUSIBLE. Un vrai titre porte au moins l'une de ces trois choses : la
         marque, un type d'article reconnu, ou une r\u00e9f\u00e9rence cr\u00e9dible. Un d\u00e9lai
         de livraison n'en a aucune, et n'en aura jamais.
         \u26a0\ufe0f J4 \u2014 c'est une garde de JUSTESSE du co\u00fbt d'achat : un prix rattach\u00e9
         \u00e0 un titre qui ne d\u00e9signe rien fausserait tout ce qui en d\u00e9coule. */
      if (titre && px != null && px > 0 && titrePlausible(titre)) {
        /* ⛔ LE DÉLAI SE LIT DANS LA TUILE, PAS AILLEURS. Demande de l'user du
           03/08 : écarter TEMPORAIREMENT ce qui dépasse huit jours, parce
           qu'il ne fait aujourd'hui que de l'envoi. La ligne de délai vit
           entre « Vendu par » et le prix — c'est le bloc qu'on tient ici, et
           le seul endroit où elle est rattachable à SON annonce.
           ⚠️ On RELÈVE, on ne juge pas : la barrière vit ailleurs, dans un
           fichier fait pour être modifié. Un parseur qui juge est un parseur
           qu'il faut rouvrir à chaque changement d'avis.
           ⚠️ J4 : ce délai ne touche à aucun prix. Il sert à décider quelles
           sources entrent dans le coût d'achat — une offre à trois semaines ne
           peut pas honorer une commande déjà encaissée. */
        var delai = null;
        for (var d = 0; d < b.length && delai == null; d++) delai = barriere.delaiEnJours(b[d]);
        /* ⛔⛔ LA PROMOTION PASSE PAR LA MÊME BARRIÈRE QUE TOUT LE RESTE.
           Défaut attrapé par `check-price-watch` le 04/08/2026 : en promouvant
           l'offre directement, je court-circuitais la barrière d'achat — une
           offre à 9 jours de délai, écartée exprès parce que l'user ne fait
           que de l'envoi, serait redevenue un coût d'achat. Douze assertions
           sont passées au rouge d'un coup, et elles avaient raison.
           ⛔ Une porte qu'on contourne n'est plus une porte : le jugement se
           fait AVANT la promotion, jamais après. */
        var refOffre = refUniqueDuTitre(titre, brand);
        var verdict = barriere.juger({ prix: px, delaiJours: delai });
        if (refOffre && verdict.retenu) {
          out.push({ sku: refOffre, price: px, name: titre, promo: false,
            enStock: null, car: extraireCaracteristiques(titre, brand),
            venuDOffre: true });
        } else {
          ecartes.push({ titre: titre, prix: px, delaiJours: delai,
            car: extraireCaracteristiques(titre, brand) });
        }
        titreOffre = null;
      } else {
        /* ⛔⛔ UN PRIX NE DISPARAÎT PLUS EN SILENCE — MAIS IL NE DEVIENT PAS
           UNE OFFRE POUR AUTANT. Mesuré le 08/08/2026 : 35 blocs par balayage
           portaient un PRIX et tombaient dans `perdus` sans qu'on puisse les
           relire. J'ai d'abord voulu les verser dans les offres écartées —
           `check-price-watch` l'a REFUSÉ, et il avait raison : « 3 à 6 jours
           ouvrés » y serait entré comme une annonce à 674 €. Un délai de
           livraison n'est pas un produit, même écarté.
           Le prix est donc simplement ÉCRIT dans le motif : on peut le relire
           dans le diagnostic, il n'entre nulle part ailleurs. */
        noter(b, !titre ? 'offre sans titre utilisable'
          : (px == null || !(px > 0)) ? 'offre sans prix lisible'
          : 'titre jugé non plausible (prix perdu : ' + px + ' €) : '
            + String(titre).slice(0, 60));
      }
      return;
    }
    // Carte produit : le titre est la PREMI\u00c8RE ligne qui commence par la marque.
    var sku = null, iTitre = -1;
    for (var t = 0; t < b.length; t++) {
      var tm = b[t].match(titreRe);
      if (!tm) continue;
      var cand = tm[1].toUpperCase();
      /* \u26d4 Une r\u00e9f porte un chiffre et n'est jamais une unit\u00e9 (\u00ab 18V \u00bb).
         Si le premier mot apr\u00e8s la marque n'en est pas une \u2014 \u00ab DeWalt DCS 579
         T2T \u00bb, o\u00f9 la r\u00e9f est \u00e9clat\u00e9e par des espaces \u2014 on N'INVENTE PAS de
         recollage : le bloc part dans les \u00e9cart\u00e9s, list\u00e9, jamais devin\u00e9. */
      if (!/\d/.test(cand) || cand.length < 4 || UNITE_RE.test(cand)) continue;
      sku = cand; iTitre = t; break;
    }
    /* ⛔⛔ LA RÉFÉRENCE N'EST PAS TOUJOURS LE PREMIER MOT APRÈS LA MARQUE.
       Mesuré le 09/08/2026 sur le balayage réel de l'user (67 pages) : les 45
       tuiles LUES ont toutes leur référence au mot 1 — mais sur les 1 094
       écartées, **517 portent une référence lisible AILLEURS dans le titre**.
       idealo écrit les machines « DeWalt DCD796P2 Perceuse… » (réf en tête) et
       les accessoires « DeWalt SDS-max 25x920x790 mm DT60826-QZ » (réf à la
       FIN). La boucle ci-dessus ne regarde que la tête : tout le rayon
       accessoires tombait donc en `sansRef`, prix compris — et 124 fiches du
       catalogue restaient sur un coût SUPPOSÉ alors que leur prix réel était
       dans la page, sous les yeux du parseur.
       ⛔ ARGENT, DONC ON NE DEVINE PAS : on n'élargit pas la regex de tête (elle
       prendrait « SDS-MAX » ou « 25X920X790 » pour des références). On appelle
       `lireReferenceDuTitre`, l'extracteur MÛR déjà utilisé par le chemin des
       annonces marchandes — celui qui sait écarter la machine de destination
       (« pour DCD785 »), les lots, les assemblages de produits et les noms de
       gamme. Il rend `null` dès qu'il faudrait deviner, et le bloc repart alors
       dans les écartés, listé, comme avant.
       ⚠️ Ce repli ne s'applique QUE si la tête n'a rien donné : là où le
       parseur lisait déjà une référence, rien ne change. */
    if (!sku) {
      for (var t2 = 0; t2 < b.length; t2++) {
        if (!titrePlausible(b[t2])) continue;
        if (!new RegExp(escapeRe(brand), 'i').test(b[t2])) continue;
        var lu = lireReferenceDuTitre(b[t2], brand);
        if (!lu || !lu.ref) continue;
        var refLue = String(lu.ref).toUpperCase();
        if (!/\d/.test(refLue) || refLue.length < 4 || UNITE_RE.test(refLue)) continue;
        /* ⛔⛔ ET ON N'ÉCRIT JAMAIS UN PRIX SUR UNE RÉFÉRENCE RECOLLÉE. Le
           lecteur d'annonces sait recoller « <marque> DCS 579 T2T » en
           DCS579T2T — c'est bon pour RAPPROCHER deux annonces, jamais pour
           poser un coût : on ne sait pas si le vrai code s'arrête au 579 ou au
           T2T, et se tromper écrit le prix d'une machine sur une autre. Ici on
           exige donc la référence écrite D'UN SEUL TENANT dans le titre.
           (Défaut attrapé PAR LA PORTE au premier jet : sans cette condition,
           trois assertions déjà existantes sont passées au rouge.) */
        if (b[t2].toUpperCase().replace(/[^A-Z0-9./-]/g, ' ').split(/\s+/).indexOf(refLue) === -1) continue;
        sku = refLue; iTitre = t2; break;
      }
    }
    if (!sku) {
      /* \u26d4\u26d4 ARGENT \u2014 LE PRIX SE LIT EN DESCENDANT DEPUIS LE TITRE, JAMAIS EN
         REMONTANT DEPUIS LA FIN DU BLOC. Trouv\u00e9 PAR LA PORTE le 03/08 : sans
         l'ancre de fin, le bloc d'une carte se prolonge jusqu'au bandeau
         \u00ab Produits favoris \u00bb de la page, et la recherche \u00e0 rebours ramenait le
         prix d'un T\u00c9L\u00c9PHONE (774,99 \u20ac) sur une scie. Un prix faux sur un titre
         juste est pire qu'une ligne absente. Le prix d'une carte SUIT son
         titre \u2014 on s'arr\u00eate au premier trouv\u00e9 apr\u00e8s lui. */
      /* ⛔⛔ LE TITRE D'UNE CARTE N'EST PAS « LA PREMIÈRE LIGNE » — C'EST LA
         PREMIÈRE LIGNE PLAUSIBLE. Son relevé du 03/08 sortait encore
         « 3 à 6 jours ouvrés » à 674 € : la garde de plausibilité existait,
         mais seulement sur la branche ANNONCE. Ici le titre était `b[0]`,
         quelle que soit la ligne — et la queue d'une offre commence toujours
         par un délai. Signature de ce chemin dans son JSON : le `car` portait
         un `sku` que la chaîne « 3 à 6 jours ouvrés » ne peut pas contenir.
         ⚠️ Une garde posée sur un seul chemin ne garde rien : le défaut prend
         l'autre. */
      var iTit = -1;
      for (var w = 0; w < b.length; w++) { if (titrePlausible(b[w])) { iTit = w; break; } }
      var pxx = null;
      for (var q = iTit + 1; q >= 1 && q < b.length; q++) {
        var ma2 = b[q].match(prixApartir);
        if (ma2) { pxx = parsePriceFR(ma2[1]); break; }
        var ms2 = b[q].match(prixSeul);
        if (ms2) { pxx = parsePriceFR(ms2[1]); break; }
      }
      /* ⛔ Et le prix se lit TOUJOURS APRÈS ce titre-là. Quand la queue d'une
         offre traîne (délai · livraison · prix) AVANT un vrai titre, ce prix
         appartient à l'offre PRÉCÉDENTE : le chercher à partir du titre le
         laisse donc de côté, et le bloc part au registre des pertes au lieu
         de coller 674 € sur la ponceuse d'en dessous. J4 : un prix rattaché à
         un article qui n'est pas le sien est un prix inexact. */
      if (iTit !== -1 && pxx != null && pxx > 0
          && new RegExp(escapeRe(brand), 'i').test(b.join(' '))) {
        /* R\u00e9f \u00e9clat\u00e9e par des espaces (\u00ab DeWalt DCS 579 T2T \u00bb) : on ne devine
           toujours pas de `sku`, mais on QUALIFIE \u2014 c'est ce qui permettra de
           rapprocher l'annonce d'une fiche sans jamais \u00e9crire son prix. */
        var descEc = b.slice(iTit, Math.min(b.length, iTit + 4)).join(' ');
        ecartes.push({ titre: b[iTit], prix: pxx, car: extraireCaracteristiques(descEc, brand) });
      } else {
        /* ⚠️ LA RAISON DOIT NOMMER LE VRAI MOTIF. Premier jet : la garde de
           plausibilité mordait, mais le registre annonçait « sans la marque »
           alors que la marque était écrite trois lignes plus bas — un registre
           de pertes qui ment sur la cause vaut à peine mieux que pas de
           registre : c'est lui qui doit m'apprendre le prochain gabarit. */
        noter(b, iTit === -1
          ? 'bloc sans référence, aucune ligne plausible comme titre : ' + String(b[0]).slice(0, 60)
          : (pxx == null || !(pxx > 0))
            ? 'bloc sans référence ET sans prix lisible après le titre « ' + String(b[iTit]).slice(0, 60) + ' »'
            : 'bloc sans référence et sans la marque');
      }
      return;
    }
    if (seen[sku]) return;
    // Prix : on cherche APR\u00c8S le titre, du plus explicite au plus simple.
    var prix = null, iPrix = -1;
    for (var p = iTitre + 1; p < b.length; p++) {
      var ma = b[p].match(prixApartir);
      if (ma) { prix = parsePriceFR(ma[1]); iPrix = p; break; }
      var ms = b[p].match(prixSeul);
      if (ms) { prix = parsePriceFR(ms[1]); iPrix = p; break; }
    }
    if (prix == null || !(prix > 0)) {
      /* Une carte dont le prix n'est pas lisible APRÈS son titre : cause la
         plus probable d'une référence « vue mais non lue ». On la nomme. */
      noter(b, 'carte « ' + sku + ' » : aucun prix lisible après le titre', true);
      return;
    }
    seen[sku] = true;
    /* \u26a0\ufe0f LE TITRE SEUL NE SUFFIT PAS. Mesur\u00e9 sur la page r\u00e9elle : idealo \u00e9crit
       \u00ab DeWalt DCS572P2 \u00bb sur une ligne et \u00ab Scie circulaire portative, 1
       batterie, 3,5 kg \u00bb sur la SUIVANTE. Le type d'outil, le nombre de
       batteries et le poids vivent tous dans ce sous-titre. Ne lire que la
       premi\u00e8re ligne, c'est jeter la moiti\u00e9 de ce que la page dit. On donne
       donc \u00e0 l'extracteur tout ce qui va du titre au prix. */
    var desc = b.slice(iTitre, iPrix < 0 ? b.length : iPrix).join(' ');
    /* ⛔⛔ LE NOM RENDU ÉTAIT FABRIQUÉ — DÉFAUT MESURÉ LE 10/08/2026, ET IL A
       COÛTÉ TROIS TOURS À L'USER. Cette ligne écrivait `brand + ' ' + sku` :
       le VRAI titre de la carte et sa description partaient à la poubelle
       juste après avoir servi à qualifier l'article. Mesuré sur son balayage :
       `name` valait « MARQUE RÉF » pour **3 156 références sur 3 156**, alors
       qu'un type d'outil avait été lu pour **2 991** d'entre elles — donc lu
       dans un texte que la réponse ne rendait pas. Impossible pour lui de
       trancher « outil nu ou pack » sur des lignes amputées.
       ⛔ Or c'est écrit sur la carte, en toutes lettres : « … DTD152Z (machine
       seule) », « … Sans batterie, Sans chargeur ». Le titre porte le
       conditionnement quand la description ne le porte pas, et inversement.
       ⛔ ON REND DONC LES DEUX, séparément. `name` ne bouge pas — des
       appelants l'affichent déjà — et le titre réel arrive à côté.
       ⚠️ Portes lues — J4 : rien ici ne touche un prix, ce sont des libellés ;
       J3 : des noms d'outils publics ; J5 : aucune fiscalité. */
    var lignesDesc = b.slice(iTitre + 1, iPrix < 0 ? b.length : iPrix)
      .filter(function (x) {
        var s = String(x || '').trim();
        if (!s) return false;
        if (/^\d+$/.test(s)) return false;                 // le compte d'avis
        if (NB_OFFRES.test(s)) return false;               // « 17 offres »
        if (/\d,\d{2}\s*€/.test(s)) return false;          // un prix
        return true;
      });
    out.push({
      sku: sku, price: prix, name: brand + ' ' + sku, promo: false, enStock: null,
      /* Le titre de la carte, mot pour mot — c'est lui qui porte « (machine
         seule) », « Solo », « avec coffret + rail de guidage ». */
      titre: String(b[iTitre] || '').slice(0, 200),
      /* La description, celle qui dit « Sans batterie, Sans chargeur ». */
      descr: lignesDesc.join(' ').slice(0, 300),
      car: extraireCaracteristiques(desc, brand)
    });
  }

  return { items: out, sansRef: ecartes, perdus: perdus };
}

/* \u2500\u2500 AIGUILLAGE DE FORMAT \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Deux sites, deux gabarits \u2014 et d'autres viendront. On ne devine pas au
   slug : on fait tourner CHAQUE parseur et on garde celui qui reconna\u00eet le
   plus de produits. Mesur\u00e9 : la page clickoutil ne contient aucun
   \u00ab Prix X,XX \u20ac \u00bb (cot\u00e9brico y rend 0) et une grille cot\u00e9brico se lit par
   son propre parseur bien mieux que par l'autre \u2014 l'aiguillage est donc
   d\u00e9terministe sur les vraies pages. Rend { format, items, packs, sansRef }. */
function parseAuto(rawText, brand) {
  var cote = parseCotebrico(rawText, brand);
  var clic = parseClickoutil(rawText, brand);
  var idea = parseIdealo(rawText, brand);   // { items, sansRef }
  if (!cote.length && !clic.items.length && !idea.items.length) {
    /* ⛔⛔ ARGENT — UNE PAGE PEUT N'ÊTRE FAITE QUE D'ANNONCES MARCHANDES, et
       cet aiguillage la jetait entière. Le repli ne regardait que `items` :
       zéro fiche ⇒ « format aucun », et il rendait `clic.sansRef` — les
       écartées de l'AUTRE gabarit, donc rien. Toutes les annonces d'idealo
       partaient avec, prix compris, sans une trace.
       Trouvé le 03/08 PAR LA PORTE, sur un corpus fait de deux offres et
       d'aucune fiche : 2 annonces lues par le parseur, 0 rendues par
       l'aiguillage. Sur ses vraies pages il y a toujours des fiches — le
       défaut attendait le premier jour où il n'y en aurait pas.
       ⛔ Une page reconnue, c'est une page dont on tire QUELQUE CHOSE : une
       fiche ou une annonce. Pas seulement une fiche. */
    if ((idea.sansRef || []).length) {
      return { format: 'idealo', items: [], packs: [], sansRef: idea.sansRef, perdus: idea.perdus };
    }
    return { format: 'aucun', items: [], packs: clic.packs, sansRef: clic.sansRef, perdus: idea.perdus };
  }
  // Le plus fécond gagne — trois gabarits mutuellement exclusifs sur les
  // vraies pages (mesuré : idealo rend 0 chez les deux autres, et vice versa).
  if (idea.items.length > cote.length && idea.items.length > clic.items.length) {
    /* Les offres marchandes d'idealo (« Vendu par : ») sortent en `sansRef` :
       ce sont des LOTS, leur prix ne s'écrit sur aucune réf tant que l'user
       n'a pas créé la fiche et posé son `srcNom`. Listés, jamais devinés. */
    return { format: 'idealo', items: idea.items, packs: [], sansRef: idea.sansRef, perdus: idea.perdus };
  }
  if (clic.items.length > cote.length) {
    return { format: 'clickoutil', items: clic.items, packs: clic.packs, sansRef: clic.sansRef };
  }
  return { format: 'cotebrico', items: cote, packs: [], sansRef: [] };
}

/* \u2500\u2500 QUAND RIEN N'EST RECONNU, LA PAGE DOIT PARLER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   N\u00e9 le 01/08/2026 : le premier essai du traqueur clickoutil a rendu
   `parsed: 0` avec pour seule explication \u00ab mauvaise page ou format
   chang\u00e9 ? \u00bb. Or \u00e0 cet instant le serveur TENAIT le HTML complet de la page \u2014
   et il l'a jet\u00e9 sans rien mesurer. Les sites fournisseurs sont injoignables
   depuis le d\u00e9p\u00f4t (CONNECT 403, mesur\u00e9 le jour m\u00eame) : ce texte-l\u00e0 est la
   SEULE occasion d'apprendre comment un nouveau site \u00e9crit ses cartes.
   Deviner le format \u00e0 la place, c'est l'origine O6 du registre (inventer ce
   qu'on ne peut pas lire).

   Cette fonction mesure donc, sur le texte re\u00e7u, chaque hypoth\u00e8se du
   parseur \u2014 s\u00e9parateur de cartes, motif \u00ab MARQUE R\u00c9F \u00bb, motif \u00ab Prix
   X,XX \u20ac \u00bb \u2014 et rapporte des COMPTES plus trois extraits bruts autour de la
   marque. Un `dryRun=1` suffit alors \u00e0 diagnostiquer un format inconnu, sans
   rien demander d'autre \u00e0 l'user que le geste qu'il fait d\u00e9j\u00e0.

   PURE (texte \u2192 objet), test\u00e9e par check-price-watch, sabotage compris.
   \u26d4 Elle ne renvoie que des morceaux de la page fournisseur re\u00e7ue \u2014 jamais
   un en-t\u00eate, un secret ou une donn\u00e9e du site. */
/* ⛔⛔ COMPTER CE QUE LA PAGE CONTIENT, PAS CE QU'ON A RÉUSSI À EN LIRE.
   Son relevé du 03/08 sortait `refsNonLues: 0` et `perdus: 0` — donc « tout
   est lu » — alors qu'il manquait une ligne sur soixante. Les deux compteurs
   ne mentaient pas : ils ne pouvaient pas voir ce trou-là. `refsNonLues` ne
   couvre que les CARTES, celles qui portent une référence ; `perdus` ne
   couvre que les blocs écartés en le sachant. Une ANNONCE MARCHANDE avalée
   par sa voisine n'apparaît dans ni l'un ni l'autre : elle n'a pas de
   référence, et aucun bloc ne s'est déclaré perdu.
   ⛔ Un instrument qui compte ce qu'il a réussi ne mesure pas son échec. Ici
   on compte les ANCRES de la page — chaque annonce marchande écrit « Vendu
   par : » exactement une fois — et on rend le TITRE attendu de chacune : la
   ligne non vide qui la précède. Le rapprochement se fait ensuite sur les
   titres réellement rendus, et l'écart est NOMMÉ, pas chiffré.
   ⚠️ J4 : une annonce perdue est un PRIX perdu. Le coût d'achat retenu est le
   minimum des sources ; en manquer une, c'est retenir un coût trop haut. */
/* ⛔⛔ DEUX SORTES DE TUILES, DEUX ANCRES — ET J'EN COMPTAIS UNE SEULE.
   L'user, mot pour mot : « il y a 60 cartes produits avec 60 prix et les 60
   sont cliquables ». Je n'en lisais que 59, et ce compteur-ci disait pourtant
   « rien ne manque » : il ne regardait que « Vendu par : ». Une tuile-FICHE
   — « 12 offres » puis « à partir de X € » — n'y était pour rien.
   Une page en porte les deux, mélangées. On compte donc les DEUX ancres. */
var ANCRE_ANNONCE = /^vendu\s+par\s*:/i;
var ANCRE_FICHE   = /^\d+\s+offres?\b/i;

/* ⛔ LES DEUX ANCRES NE SE LISENT PAS PAREIL, ET VOULOIR LES UNIFIER CASSE
   L'AUTRE. Premier jet : « on remonte au début de la tuile » pour les deux —
   quatre assertions rouges d'un coup, dont celles de D-90 qui prouvaient déjà
   le cas des annonces.
   · Une ANNONCE écrit « Vendu par : » juste sous son titre : le titre est la
     dernière ligne non vide au-dessus. Mesuré, éprouvé, on n'y touche pas.
   · Une FICHE écrit titre PUIS sous-titre PUIS « 12 offres » : s'arrêter à la
     ligne du dessus rendrait le SOUS-TITRE. On remonte donc jusqu'au début de
     la tuile — borné par une ligne vide, un prix, ou une autre ancre,
     c'est-à-dire par la fin de la tuile précédente. */
function titreDeTuile(lignes, i, estFiche) {
  var vues = [];
  for (var j = i - 1; j >= 0 && j >= i - 8; j--) {
    var ligne = lignes[j];
    if (!ligne) { if (vues.length) break; continue; }
    if (!estFiche) return ligne;                       // annonce : la ligne du dessus
    if (vues.length && (/\d,\d{2}\s*€/.test(ligne)
      || ANCRE_ANNONCE.test(ligne) || ANCRE_FICHE.test(ligne))) break;
    vues.push(ligne);
  }
  return vues.length ? vues[vues.length - 1] : null;
}

function titresAttendus(rawText) {
  var lignes = stripHtml(rawText).split('\n').map(function (l) { return l.trim(); });
  var out = [];
  for (var i = 0; i < lignes.length; i++) {
    var estAnnonce = ANCRE_ANNONCE.test(lignes[i]);
    var estFiche = !estAnnonce && ANCRE_FICHE.test(lignes[i]);
    if (!estAnnonce && !estFiche) continue;
    var t = titreDeTuile(lignes, i, estFiche);
    if (t) out.push(t);
  }
  return out;
}

/* ⛔ ON COMPTE, ON NE COCHE PAS. Deux marchands vendant le MÊME article
   écrivent le même titre — c'est le cas normal d'un comparateur, et sa page
   en portait déjà (31 annonces pour 30 noms distincts). Un simple « ce titre
   est-il ressorti ? » déclarerait la paire complète alors qu'une des deux
   manque : le trou serait invisible, et c'est exactement le défaut qu'on
   répare. On rapproche donc des MULTISETS.
   ⚠️ Extraite du point d'entrée pour être GARDÉE : tant qu'elle vivait en
   ligne dans la réponse, aucun sabotage ne pouvait mordre dessus. */
/* ⛔ LE COMPTE BRUT DES TUILES — il ne dépend d'AUCUN titre, d'aucun repli,
   d'aucun vocabulaire. C'est lui qui répond à « la page en a-t-elle 60 ? »
   sans rien devoir au parseur. Le rapprochement nommé peut sous-estimer quand
   la page n'a pas de lignes vides ; ce compte-là, non. */
function compterTuiles(rawText) {
  var lignes = stripHtml(rawText).split('\n').map(function (l) { return l.trim(); });
  var annonces = 0, fiches = 0;
  for (var i = 0; i < lignes.length; i++) {
    if (ANCRE_ANNONCE.test(lignes[i])) annonces++;
    else if (ANCRE_FICHE.test(lignes[i])) fiches++;
  }
  return { annonces: annonces, fiches: fiches, total: annonces + fiches };
}

/* ══ APPARIER PAR LE NOM — SOUPLE SUR LES MOTS, INTRAITABLE SUR LES MESURES ══
   ⛔⛔ LE PROBLÈME, MESURÉ LE 03/08. 379 fiches de son catalogue — 30,9 %, et
   166 485,89 € de prix affichés — n'ont AUCUNE référence constructeur : elles
   portent un code interne (`AC-00100736`) et se suivent par leur nom exact
   (`srcNom`). L'appariement exigeait une égalité MOT POUR MOT entre ce nom et
   le titre du comparateur. Résultat : **3 fiches sur 379**. Or idealo n'écrit
   pas ses titres comme clickoutil. Les produits SONT là ; c'est le
   rapprochement qui ne les voit pas.
   ⛔ L'user a posé le choix : réparer, ou supprimer les 379. Supprimer, ce
   serait effacer un tiers du catalogue pour une limite d'appariement — pas
   pour une absence de produit. On répare.

   ⛔⛔ SOUPLE NE VEUT PAS DIRE APPROXIMATIF, et c'est toute la difficulté. Sa
   consigne, mot pour mot : « il faut que tu crées une certaine souplesse […]
   mais il faut qu'ils soient précis toujours, c'est le plus important, car
   sinon le traqueur ne marchera pas bien ». Un rapprochement trop large écrit
   le coût d'un article sur la fiche d'un autre — la faute la plus chère du
   projet, et elle ne se voit pas : le prix reste plausible.

   ⛔ LA SOUPLESSE PORTE SUR LES MOTS, JAMAIS SUR LES MESURES. On ne compare pas
   des chaînes de caractères, on compare les CARACTÉRISTIQUES déjà extraites et
   déjà éprouvées — protocole §1.4, le bon outil existe déjà. Deux verrous, et
   aucun n'est facultatif :
   · AUCUNE caractéristique connue des deux côtés ne doit diverger
     (`comparerCaracteristiques`) — une 1800 W n'est pas une 2000 W, une
     raboteuse n'est pas une scie, et le coffret comme l'édition limitée y font
     barrage ;
   · il faut au moins CONCORDANCES_MIN mesures concordantes EN PLUS des trois
     champs d'entonnoir, sinon « perceuse 18V » rapprocherait quarante fiches.
   ⚠️ L'INDEX PAR TYPE N'EST PAS UN TROISIÈME VERROU, et le sabotage l'a montré :
   le retirer laisse le contrôle VERT, parce que `type` est déjà un champ
   bloquant de `comparerCaracteristiques`. C'est une OPTIMISATION — sans lui,
   379 fiches × 60 annonces font 22 740 comparaisons par page. Le dire évite
   qu'on le prenne pour une garde, et qu'on relâche l'autre en le croyant
   suffisant.
   ⛔ ET L'AMBIGUÏTÉ NE S'ARBITRE JAMAIS : deux fiches candidates pour un titre,
   ou deux titres pour une fiche, et on ne rapproche RIEN. Ne rien écrire coûte
   un relevé ; écrire faux coûte une vente à perte.

   ⚠️ L'ÉGALITÉ EXACTE GARDE LA PRIORITÉ ABSOLUE — cette fonction ne voit que ce
   que l'appariement exact n'a pas su placer.
   ⚠️ FONCTION PURE, aucune entrée/sortie, aucun état.

   ⚠️ PORTE J4 LUE (`node scripts/juridique.js J4`) : le prix annoncé doit être
   exact et complet, et une réduction se réfère au prix le plus bas des 30 jours
   précédents. Ce que cette fonction engage est en amont : elle décide QUEL COÛT
   se rattache à QUELLE FICHE, donc quel prix sera affiché. ⛔ AUCUN PRIX
   N'ENTRE DANS LA DÉCISION — ni comme critère, ni comme départage : un prix qui
   départagerait choisirait le moins cher et fabriquerait une aubaine qui
   n'existe pas. Le prix n'est LU qu'après, une fois l'identité établie.
   ⚠️ J3 — des libellés d'outils publics, aucune donnée personnelle. J5 — aucune
   TVA, aucun octroi de mer. */
/* ⛔⛔ CE QUE LE SEUIL COÛTE VRAIMENT, MESURÉ SUR SES 379 FICHES LE 04/08.
   Quiconque touchera à `CONCORDANCES_MIN` doit lire ces trois chiffres — ils
   disent où est le problème, et surtout où il n'est PAS :
   ·  15 fiches (4,0 %) portent MOINS de deux mesures exploitables : pour
      elles l'appariement est ARITHMÉTIQUEMENT impossible, aucun titre
      fournisseur même parfait n'y changera rien (« Ceinture porte-outils en
      cuir 18 compartiments » n'a que son décompte). Baisser le seuil à 1 les
      rendrait appariables — et rendrait aussi appariables des dizaines de
      fiches sur une seule mesure commune. Ce n'est pas un réglage, c'est un
      arbitrage entre 15 fiches gagnées et un risque d'écrire faux ;
   ·  43 fiches (11 %) sont INDISCERNABLES entre elles au sens de cet
      appariement — quatre rails de guidage qui ne diffèrent que par une
      longueur non extraite. Aucun titre ne pourra jamais les séparer : le
      remède est dans la FICHE, pas dans le seuil ;
   ·  336 fiches (89 %) sont DISCERNABLES. Le catalogue n'est donc pas le
      goulot.
   ⛔ ET POURTANT le relevé réel du 04/08 n'en apparie que DIX. Ni le seuil ni
   l'ambiguïté n'expliquent l'écart — la cause restante est en amont, du côté
   des titres que le comparateur rend pour ces annonces. C'est ce que compte
   désormais `appariementNom` dans la réponse (`ambigus` contre `sansCandidat`).
   ⚠️ Tant que ce compte n'est pas revenu d'un vrai balayage, toucher au seuil
   serait régler un cadran au hasard. */
/* ══ RÉFÉRENCE ÉCRITE AVEC DES ESPACES — LE CATALOGUE TRANCHE ══════════════
   ⛔⛔ DÉFAUT D'ARGENT MESURÉ LE 09/08/2026, SUR SA CAPTURE ET SON BALAYAGE.
   Le comparateur écrit certaines cartes « DeWalt DCG 405 N » — référence
   ÉCLATÉE PAR DES ESPACES. Le parseur refuse de recoller (et il a raison :
   on ne sait pas si le vrai code s'arrête au 405 ou au N, et écrire un prix
   sur une devinette est interdit). Conséquence : cette carte partait aux
   rejets… ALORS QU'ELLE PORTAIT LE PRIX LE PLUS BAS. Le traqueur retenait
   donc une tuile PLUS CHÈRE et le prix de vente montait à tort.
   Mesuré sur son relevé : la meuleuse était à 116,90 € sur la carte rejetée
   et le traqueur voulait la vendre 225,42 € au lieu de 204,23 € ; sur le
   souffleur, 244,13 € au lieu de 145,48 € — 98,65 € de trop.

   ⛔ CE QUI CHANGE, ET POURQUOI CE N'EST PLUS UNE DEVINETTE : on ne recolle
   que si le résultat est ÉGAL à la référence d'une fiche du CATALOGUE. Ce
   n'est plus la forme qui tranche, c'est la liste des produits réels — le
   même principe que la table des préfixes constructeur. Aucune fiche
   correspondante ⇒ on ne rapproche rien, comme avant.

   ⛔⛔ ET LA GARDE D'ARGENT INVERSE, ELLE, EST OBLIGATOIRE. Sur la même page :
   « DeWalt DCG 405 N + 1x 4,0Ah » (216,96 €) et « DeWalt DCG 405 N (1x 5,0 Ah) »
   (224,59 €) recollent eux aussi vers DCG405N — mais ce sont des LOTS. Écrire
   leur prix sur l'outil nu, c'est le défaut que le projet interdit depuis le
   premier jour. Tout titre qui annonce un contenu (batterie, chargeur, « + »,
   coffret, décompte de pièces) est donc REFUSÉ ici, quoi qu'il recolle.

   ⚠️ Rend { items, restants } — même forme que les autres appariements, et
   ce qui n'est pas apparié RESTE listé : on écarte, on n'efface pas. */
function apparierParRefRecollee(annonces, fiches, marque) {
  var res = { items: [], restants: [] };
  var liste = annonces || [];
  if (!liste.length) return res;
  /* Index des références RÉELLES, forme normalisée → la fiche. La normalisation
     retire tirets et points : « DCV 100 XJ » doit pouvoir retrouver
     « DCV100-XJ », qui est la référence telle que le constructeur l'écrit. */
  var parRef = Object.create(null), collisions = Object.create(null);
  (fiches || []).forEach(function (p) {
    if (!p || !p.sku) return;
    var k = String(p.sku).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!k) return;
    if (parRef[k] && parRef[k].sku !== p.sku) { collisions[k] = 1; return; }
    parRef[k] = p;
  });
  /* Le titre annonce-t-il un CONTENU ? Alors son prix est celui d'un lot. */
  function annonceUnLot(titre) {
    var t = String(titre || '');
    if (/\s\+\s|\s\+\d|\+\s*\d/.test(t)) return true;              // « … + 1x 4,0Ah »
    if (/\d\s*[x×]\s*\d+[.,]?\d*\s*ah\b/i.test(t)) return true;    // « 1x 5,0 Ah »
    if (/\bah\b/i.test(t) && /\d/.test(t)) return true;            // toute capacité annoncée
    if (/\b(chargeur|charger|ladeger|batterie|akku|coffret|tstak|toughsystem|makpac|set|kit|pack|lot)\b/i.test(t)) return true;
    return false;
  }
  var reEclatee = /\b([A-Z]{2,5})\s+(\d{2,5})\s*([A-Z][A-Z0-9-]{0,6})?\b/;
  /* ⛔⛔ CERTAINES RÉFÉRENCES COMMENCENT PAR UN CHIFFRE — mesuré le 09/08/2026 :
     59 fiches sur 611 d'une des marques suivies (formes « 198458-6 », « 7104L »,
     « 2012NB »). Le lecteur de référence exige une LETTRE en tête : il ne les
     voyait donc PAS DU TOUT, et ces produits ne pouvaient jamais recevoir de
     coût — quoi que le comparateur affiche.
     ⛔ POURQUOI C'EST SÛR ICI ET NULLE PART AILLEURS : un nombre nu ressemble à
     tout (un prix, une cote, une année). On ne l'accepte donc QUE s'il est
     ÉGAL à la référence d'une fiche du catalogue — la même règle que le
     recollage juste au-dessus. Le catalogue tranche ; la forme, jamais. */
  var reNumerique = /\b(\d{4,7}(?:-\d)?[A-Z]{0,3}|\d{3}[A-Z]\d{2}-\d)\b/;
  /* ⛔⛔ LA RÉFÉRENCE ENTRE PARENTHÈSES EN FIN DE TITRE DÉSIGNE L'ARTICLE.
     Mesuré le 10/08/2026, en vase clos, sur son balayage de 112 pages : NEUF
     fiches « Power Source Kit … (198458-6) » plus un « Battery Combo Kit
     DLM330Z + DHW180Z … (DLX2583T) » étaient écartées parce que le titre
     annonce un contenu. Or ces fiches SONT le kit : la référence finale est
     celle de l'article vendu, les autres ne sont que ses composants.
     ⛔ ET LA RÈGLE RÉPARE UN FAUX POSITIF EN MÊME TEMPS QU'ELLE GAGNE : sur
     « Patin graphite pour ponceuse à bande 9403/9403J (421648-9) », la
     parenthèse porte 421648-9 — le patin — et 9403J n'est cité qu'en
     COMPATIBILITÉ. En ne lisant QUE la parenthèse finale, on cesse d'écrire
     9,10 € sur une ponceuse vendue 332,68 €.
     ⛔ Trois gardes, et il faut les trois : la parenthèse est la DERNIÈRE chose
     du titre ; elle ne contient QU'UNE référence (pas « (2x Battery 4 Ah) ») ;
     et cette référence EST une fiche du catalogue — le catalogue tranche,
     jamais la forme.
     ⚠️ J4 : le prix retenu reste CELUI DE LA TUILE, jamais recalculé, jamais
     annoncé barré. Ce qui change ici est la fiche à laquelle il s'applique —
     et l'erreur qu'on répare est justement un prix posé sur le mauvais
     article, donc un prix de vente faux. */
  var reParenFinale = /\(([A-Z0-9][A-Z0-9 ./-]{2,24})\)\s*$/;
  /* ⛔⛔ UN « + » NE DISQUALIFIE PAS QUAND LE SUFFIXE DIT LE MÊME CONTENU.
     Mesuré au même endroit : « Makita DHR 202 RFJ 18 V + 2x 3,0 Ah + chargeur
     et Makpac » à 278,04 € était écarté, alors que le suffixe RFJ de la fiche
     décrit EXACTEMENT ça — 2 batteries 3 Ah en coffret MAKPAC. Le « + » y
     énumère le contenu DE LA RÉFÉRENCE NOMMÉE, pas un lot de deux produits.
     ⚠️ On n'accepte que si le suffixe est CONNU et que le titre concorde sur le
     nombre de batteries ; une concordance partielle ne suffit pas. J4 : sans
     cette garde, on écrirait un prix de kit sur un outil nu. */
  /* ⛔⛔ ON LIT LE CONTENU SUR LE TITRE BRUT, PAS SUR LA QUALIFICATION.
     Défaut mesuré en vase clos le 10/08/2026 sur « Makita DHR 202 RFJ 18 V +
     2x 3,0 Ah + chargeur et Makpac » : `extraireCaracteristiques` lit bien
     « 2 batteries / 3 Ah »… puis le VERROU DE L'ENTONNOIR les EFFACE, parce
     que le titre — dominé par « chargeur » et « Ah » — a été typé dans le
     rayon ÉNERGIE, où ces mesures n'ont pas leur place. Le verrou a raison sur
     son terrain : une lame n'a pas d'ampères-heures. Mais ici on ne cherche
     pas à qualifier l'article, on cherche à savoir si le titre ÉNONCE le
     contenu que le suffixe décrit — et cette question-là se pose sur le texte,
     avant tout classement.
     ⚠️ Mêmes écritures que le lecteur principal, et rien de plus : « 2x 3,0 Ah »
     et « 2 batteries ». Une lecture plus large ici rapprocherait sur du vide. */
  function contenuAnnonce(titre) {
    var s = String(titre || '');
    var m = s.match(/\b(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*Ah\b/i);
    if (m) return { nb: parseInt(m[1], 10), ah: parseFloat(m[2].replace(',', '.')) };
    var mb2 = s.toLowerCase().match(/(?:^|[^a-z0-9])(\d+)\s*batteries?\b/);
    if (mb2) {
      var ma2 = s.match(/(\d+(?:[.,]\d+)?)\s*Ah\b/i);
      return { nb: parseInt(mb2[1], 10), ah: ma2 ? parseFloat(ma2[1].replace(',', '.')) : null };
    }
    return null;
  }
  function suffixeDitLeContenu(titre, sku) {
    var l = nomen.lireSuffixeMakita(String(sku || '').toUpperCase());
    if (!l || !l.config || typeof l.config.nbBatteries !== 'number') return false;
    var dit = contenuAnnonce(titre);
    if (!dit) return false;
    if (dit.nb !== l.config.nbBatteries) return false;
    if (dit.ah != null && l.config.ah && Math.abs(dit.ah - l.config.ah) > 0.05) return false;
    return true;
  }
  liste.forEach(function (e) {
    var titre = String((e && e.titre) || '');
    var prix = e && (typeof e.prix === 'number' ? e.prix : e.price);
    if (!titre || !(prix > 0)) { res.restants.push(e); return; }
    var mp = titre.match(reParenFinale);
    if (mp) {
      var refParen = mp[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (refParen && !collisions[refParen] && parRef[refParen]) {
        res.items.push({
          sku: parRef[refParen].sku, price: prix, name: titre, promo: false,
          enStock: null, car: extraireCaracteristiques(titre, marque),
          refRecollee: true, refParenthese: true
        });
        return;
      }
    }
    if (annonceUnLot(titre)) {
      /* Dernier recours avant le rejet : la référence nommée porte-t-elle un
         suffixe qui DIT le contenu que le titre énumère ? */
      var mLot = titre.match(reEclatee);
      var recolleLot = mLot
        ? (mLot[1] + mLot[2] + (mLot[3] || '')).toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
      if (recolleLot && !collisions[recolleLot] && parRef[recolleLot]
          && suffixeDitLeContenu(titre, parRef[recolleLot].sku)) {
        res.items.push({
          sku: parRef[recolleLot].sku, price: prix, name: titre, promo: false,
          enStock: null, car: extraireCaracteristiques(titre, marque),
          refRecollee: true, contenuConcordant: true
        });
        return;
      }
      res.restants.push(e); return;
    }
    /* ⛔ La référence doit être écrite EN CAPITALES par le marchand — c'est ce
       qui la distingue d'un mot ordinaire suivi d'un nombre (défaut déjà payé :
       « bidon 600ML » donnait « BIDON600 »). On cherche donc sur le titre TEL
       QUEL, jamais sur sa version en majuscules. */
    var m = titre.match(reEclatee);
    if (!m) {
      /* Second essai : une référence qui commence par un chiffre. Elle n'est
         retenue que si le catalogue la reconnaît (contrôle plus bas). */
      var mn = titre.match(reNumerique);
      if (!mn) { res.restants.push(e); return; }
      var recolleNum = mn[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (collisions[recolleNum]) { res.restants.push(e); return; }
      var ficheNum = parRef[recolleNum];
      if (!ficheNum) { res.restants.push(e); return; }
      res.items.push({
        sku: ficheNum.sku, price: prix, name: titre, promo: false, enStock: null,
        car: extraireCaracteristiques(titre, marque), refRecollee: true
      });
      return;
    }
    var tete = m[1];
    if (SERIES.indexOf(tete.toLowerCase()) !== -1) { res.restants.push(e); return; }
    if (tete === String(marque || '').toUpperCase()) { res.restants.push(e); return; }
    if (/^(EN|ISO|NF|CE|FFP|DIN|ANSI|SDS|IP)$/.test(tete)) { res.restants.push(e); return; }
    var recolle = (tete + m[2] + (m[3] || '')).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (collisions[recolle]) { res.restants.push(e); return; }   // deux fiches : on ne tranche pas
    var fiche = parRef[recolle];
    if (!fiche) { res.restants.push(e); return; }                // aucune fiche : on ne devine pas
    res.items.push({
      sku: fiche.sku,                       // ⛔ la référence du CATALOGUE, jamais notre recollage
      price: prix, name: titre, promo: false, enStock: null,
      car: extraireCaracteristiques(titre, marque),
      refRecollee: true                     // traçable : d'où vient ce rapprochement
    });
  });
  return res;
}

/* ══ RACINE NUE ↔ FICHE CONDITIONNÉE — LA CONFIGURATION DOIT CONCORDER ═════
   ⛔⛔ MESURÉ LE 09/08/2026 SUR SON BALAYAGE DE 112 PAGES. Le comparateur écrit
   souvent la référence NUE (« MAKITA DHS680 ») là où la fiche porte son
   conditionnement. **180 fiches sur 611** sont dans ce cas — c'est le premier
   poste de non-reconnaissance, loin devant tout le reste.

   ⛔⛔ ET C'EST LE PLUS DANGEREUX À TRAITER. La racine `DHS680` désigne CINQ
   fiches du catalogue (Z, ZJ, RGJ, RTJ, RFJ) : machine seule, en coffret, avec
   deux batteries 3 / 5 / 6 Ah. Prendre la première venue, c'est écrire le prix
   d'un kit sur un outil nu — ou l'inverse. Cas mesuré : `DUC256PT2` est vendue
   754,13 € et le comparateur montre `DUC256` à 352,18 €. Les rapprocher ferait
   **vendre à perte**.

   ⛔ LA RÈGLE, DONC : on ne rapproche QUE si l'annonce ÉNONCE une configuration
   et qu'elle concorde avec ce que le suffixe de la fiche décrit. Une annonce
   MUETTE sur son contenu n'est jamais rapprochée — pas par prudence molle, par
   arithmétique : rien ne permet de trancher, et un coût faux fabrique un prix
   faux.
   ⚠️ Mesuré au même moment : sur ce balayage-là, **2 254 annonces sur 2 254**
   étaient muettes. La règle ne rendra donc rien tant que le relevé ne portera
   pas le contenu lu (`nBat`, `chg`, `cof`) — c'est dit, pas caché.

   `annonces` : [{ titre, prix, car }] — `car` vient de `extraireCaracteristiques`.
   Rend { items, restants } comme les autres appariements. */
function apparierParConfiguration(annonces, fiches, marque) {
  var res = { items: [], restants: [] };
  var liste = annonces || [];
  if (!liste.length) return res;
  if (!/^makita$/i.test(String(marque || '').replace(/[\s-]/g, ''))) {
    /* ⛔ La table des suffixes est celle de MAKITA, et d'elle seule — même
       leçon que les préfixes DeWALT, qui avaient fait chuter le typage de 70
       fiches en s'appliquant à une autre marque. */
    return { items: [], restants: liste };
  }
  /* Index des fiches par RACINE, avec la configuration que leur suffixe décrit. */
  var parRacine = Object.create(null);
  (fiches || []).forEach(function (p) {
    if (!p || !p.sku) return;
    var l = nomen.lireSuffixeMakita(p.sku);
    if (!l || !l.config) return;              // suffixe inconnu : on ne devine pas
    (parRacine[l.racine] = parRacine[l.racine] || []).push({ fiche: p, cfg: l.config });
  });
  liste.forEach(function (e) {
    var titre = String((e && e.titre) || (e && e.name) || '');
    var prix = e && (typeof e.prix === 'number' ? e.prix : e.price);
    if (!titre || !(prix > 0)) { res.restants.push(e); return; }
    var lu = nomen.lireSuffixeMakita((e.car && e.car.sku) || e.sku || '');
    /* On ne traite QUE la racine nue : une annonce qui porte déjà son suffixe
       est l'affaire de l'appariement exact, en amont. */
    if (!lu || lu.suffixe !== '') { res.restants.push(e); return; }
    var cands = parRacine[lu.racine];
    if (!cands || !cands.length) { res.restants.push(e); return; }
    /* ⛔ CE QUE L'ANNONCE ÉNONCE. Un champ absent est une IGNORANCE, et une
       ignorance NE VOTE PAS (règle du rapprochement, déjà payée trois fois). */
    var car = e.car || {};
    var nbAnn = (typeof car.nbBatteries === 'number') ? car.nbBatteries
      : (typeof e.nBat === 'number' ? e.nBat : null);
    if (nbAnn === null) { res.restants.push(e); return; }   // muette : jamais rapprochée
    var ahAnn = (typeof car.ah === 'number') ? car.ah : null;
    var retenus = cands.filter(function (c) {
      if (c.cfg.nbBatteries !== nbAnn) return false;
      /* L'Ah ne tranche que s'il est ANNONCÉ des deux côtés. */
      if (ahAnn !== null && c.cfg.ah && Math.abs(c.cfg.ah - ahAnn) > 0.05) return false;
      return true;
    });
    /* ⛔ L'AMBIGUÏTÉ NE S'ARBITRE JAMAIS. Deux fiches compatibles ⇒ on ne
       rapproche rien : la règle vaut depuis le premier jour du projet. */
    if (retenus.length !== 1) { res.restants.push(e); return; }
    res.items.push({
      sku: retenus[0].fiche.sku, price: prix, name: titre,
      promo: false, enStock: null, car: e.car || null, parConfiguration: true
    });
  });
  return res;
}

var CONCORDANCES_MIN = 2;
function apparierParNomSouple(annonces, fiches, marque) {
  var res = { items: [], restants: [], ambigus: [] };
  var fichesUtiles = (fiches || []).filter(function (p) { return p && p.srcNom && p.sku; });
  if (!fichesUtiles.length) {
    res.restants = (annonces || []).slice();
    return res;
  }
  /* Index par TYPE : sans lui, 379 fiches × 60 annonces font 22 740
     comparaisons par page. Le type étant le premier verrou, il sert de clé. */
  var parType = Object.create(null);
  fichesUtiles.forEach(function (p) {
    var car = extraireCaracteristiques(p.srcNom, marque);
    if (!car.type) return;                       // sans type, rien à indexer
    (parType[car.type] = parType[car.type] || []).push({ fiche: p, car: car });
  });

  /* ⛔ On COMPTE d'abord, on écrit ensuite. Une fiche réclamée par deux
     annonces différentes doit être écartée des DEUX ; décider au fil de l'eau
     laisserait l'ORDRE des annonces trancher, ce qui est un hasard. */
  var pretendants = Object.create(null);
  var choix = [];
  (annonces || []).forEach(function (e) {
    var titre = e && (e.titre || e.name);
    if (!titre || !(Number(e.prix) > 0)) { res.restants.push(e); return; }
    var carA = extraireCaracteristiques(titre, marque);
    var cands = carA.type ? (parType[carA.type] || []) : [];
    var retenus = [];
    for (var i = 0; i < cands.length; i++) {
      var cmp = comparerCaracteristiques(carA, cands[i].car);
      if (!cmp.compatible) continue;
      /* Les trois champs d'entonnoir ne sont pas des mesures : les compter
         ferait passer « machine / perçage / perceuse » pour trois preuves. */
      var mesures = cmp.concordances.filter(function (c) {
        return c !== 'famille' && c !== 'rayon' && c !== 'type';
      });
      if (mesures.length < CONCORDANCES_MIN) continue;
      retenus.push(cands[i].fiche);
    }
    if (retenus.length !== 1) {
      if (retenus.length > 1) {
        res.ambigus.push({ titre: String(titre).slice(0, 90), candidats: retenus.length });
      }
      res.restants.push(e);
      return;
    }
    var id = String(retenus[0].sku).toUpperCase();
    pretendants[id] = (pretendants[id] || 0) + 1;
    choix.push({ id: id, p: retenus[0], e: e, titre: titre });
  });

  choix.forEach(function (c) {
    if (pretendants[c.id] !== 1) {
      res.ambigus.push({ titre: String(c.titre).slice(0, 90), fiche: c.p.sku,
        candidats: pretendants[c.id] });
      res.restants.push(c.e);
      return;
    }
    res.items.push({ sku: c.p.sku, price: Number(c.e.prix), name: String(c.titre),
      promo: false, enStock: null, parNomSouple: true });
  });
  return res;
}

/* ══ LA RACINE D'UNE RÉFÉRENCE — le suffixe commercial ne fait pas l'identité ══
   Décision de l'user, 03/08, mot pour mot : « DCE079D1G-QW = DCE079D1G, ce sont
   exactement les mêmes produits. Le préfixe ne veut pas dire grand-chose si la
   référence au début est exactement la même […] sur idealo on n'a pas besoin de
   regarder le suffixe, car tous les sites qui sont dessus sont européens ».

   ⛔ CE QUE ÇA DÉBLOQUE, MESURÉ LE 03/08 : sur ses 177 vraies références DeWALT,
   **150 portent un suffixe** (-XJ 115, -QS 18, -QW 16, -QZ 1). Une comparaison
   qui exige le suffixe exact rate donc l'article dès que le marchand écrit
   `DW743N` là où la fiche dit `DW743N-QS` — et c'est le cas le plus courant.
   ⛔ ET AUCUNE COLLISION : ces 177 références se réduisent à 177 racines
   DISTINCTES. Neutraliser le suffixe ne peut donc confondre aucune de ses
   fiches. Ce n'est pas une supposition, c'est un comptage — et l'appelant
   REVÉRIFIE quand même l'unicité, parce qu'un catalogue change.

   ⛔ ON NE COUPE QU'UN SUFFIXE DE LETTRES, EN FIN DE CHAÎNE. Trois pièges que
   cette règle évite, tous présents dans son catalogue :
   · `DCD709NT-XJ` et `DCD709N-XJ` diffèrent AVANT le tiret — NT désigne la
     version coffret. Couper au premier tiret les confondrait, et un prix
     d'outil nu s'écrirait sur une fiche à coffret ;
   · `DWST1-81078` finit par des CHIFFRES : c'est un numéro d'article, pas un
     marquage. On ne coupe jamais un segment qui contient un chiffre ;
   · `DCLE14361GB-XJ` porte « GB » à l'intérieur : seul le DERNIER segment part.

   ⚠️ PORTE J4 LUE (`node scripts/juridique.js J4`) : le prix annoncé doit être
   exact et complet, et une réduction se réfère au prix le plus bas des 30 jours
   précédents. Cette fonction ne touche à AUCUN prix — elle rend une chaîne de
   caractères qui sert à reconnaître un article. Ce qu'elle engage est ailleurs,
   et il faut le dire : élargir un rapprochement, c'est risquer d'écrire le coût
   d'un article sur la fiche d'un autre. C'est pourquoi elle ne coupe QUE le
   marquage commercial, jamais un segment porteur de sens, et pourquoi les
   caractéristiques bloquantes (coffret, édition limitée, nombre d'outils)
   continuent de trancher APRÈS elle.
   ⚠️ FONCTION PURE. J3 — des références d'outils publiques, aucune donnée
   personnelle. J5 — aucune TVA, aucun octroi de mer. */
var SUFFIXE_COMMERCIAL = /-[A-Z]{2,3}$/;
function racineRef(sku) {
  var s = String(sku || '').trim().toUpperCase();
  if (!s) return '';
  var r = s.replace(SUFFIXE_COMMERCIAL, '');
  /* Une racine trop courte n'identifie plus rien : `AB-XJ` deviendrait `AB` et
     accrocherait n'importe quoi. En dessous de cinq signes on garde l'écriture
     complète — même seuil que partout ailleurs pour juger une référence
     crédible. */
  return r.length >= 5 ? r : s;
}

/* ⛔⛔⛔ LA RACINE DE MODÈLE — RÈGLE DE L'USER, 04/08/2026, MOT POUR MOT :
   « tu ne regardes plus les lettres après les numéros !!! tu te bases sur la
   description du produit et sur les premières lettres, ainsi que les numéros
   qui viennent après !!! et tu me vires les doublons, tu prends le moins cher »

   Donc : LETTRES DE TÊTE + CHIFFRES QUI SUIVENT, et on s'arrête à la première
   lettre qui vient après un chiffre. `DCE560N-XJ`, `DCE560D1-QW` et `DCE560`
   sont le MÊME modèle — c'est lui qui l'a établi sur son propre catalogue,
   après que je me sois trompé en les séparant.

   ⚠️ POURQUOI ON NE COUPE PAS AU PREMIER GROUPE DE CHIFFRES TOUT COURT.
   `DWST1-81078` (rangement) deviendrait `DWST1`, et TOUS les coffrets DWST1-…
   se confondraient en un seul produit. Un groupe `-chiffres` qui suit fait
   donc partie du modèle ; seule une LETTRE après un chiffre ferme la racine.

   Vérifié à l'écriture :
     DCE560N-XJ → DCE560    DCE560D1-QW → DCE560    DCM200NT-XJ → DCM200
     D24000     → D24000    DWST1-81078 → DWST1-81078    DT4763-QZ → DT4763
   ⚠️ Une écriture qui ne commence pas par des lettres (`2-910`, `AT-DXAM2250`)
   est rendue TELLE QUELLE : mieux vaut ne pas regrouper que regrouper faux.

   ⛔ Cette racine ne suffit JAMAIS à elle seule pour un prix : elle réunit le
   nu, le coffret et le kit avec batteries. C'est la DESCRIPTION qui les
   sépare — voir `varianteProduit` dans scripts/classer-idealo.js. */
function racineModele(sku) {
  var s = String(sku || '').trim().toUpperCase();
  if (!s) return '';
  var m = s.match(/^([A-Z]+)(\d+)((?:-\d+)*)/);
  if (!m) return s;
  var racine = m[1] + m[2] + (m[3] || '');
  /* Même garde que `racineRef` : en dessous de quatre signes, une racine
     n'identifie plus rien et accrocherait n'importe quoi. */
  return racine.length >= 4 ? racine : s;
}


/* ══ LIRE LE TITRE D'UNE ANNONCE — L'IDENTITÉ RÉELLE D'UN PRODUIT ═══════════
   ⛔⛔⛔ RÈGLE DE L'USER, 04/08/2026, MOT POUR MOT : « le parseur et le
   traqueur doivent LIRE LE TITRE de l'annonce. Si la référence c'est DCD800,
   le même produit peut avoir N / NT / T / NT-XJ mais c'est le MÊME PRODUIT.
   Notre switch à l'intérieur des cartes produit est là pour les fusionner —
   chaque site nomme comme il veut, il ne respecte pas forcément la nomenclature
   du fournisseur. Et le XJ peut changer, c'est la région ; sur certains outils
   on trouve QW ou QS. On ne les regarde JAMAIS. »

   ⛔ CE CODE VIVAIT DANS `scripts/classer-idealo.js`, HORS LIGNE. Le traqueur
   ne pouvait donc pas s'en servir : il appariait sur `racineRef`, qui rend
   QUATRE clés différentes pour un seul produit (DCD800N, DCD800NT, DCD800T,
   DCD800). Conséquence mesurée : chaque écriture nu/coffret partait sur une
   fiche distincte, et les prix ne pouvaient pas s'aligner en mode réel.
   Il vit désormais ici, à côté de `racineModele`, et les deux mondes lisent la
   MÊME vérité — une seconde copie divergerait au premier correctif (O6).

   ⚠️ PORTE J4 LUE : rien ici ne touche un prix. Mais élargir un rapprochement,
   c'est risquer d'écrire le coût d'un article sur la fiche d'un autre — c'est
   pourquoi la VARIANTE (contenu de la boîte, lu dans le titre) continue de
   trancher après la racine, et pourquoi un article vendu POUR une machine est
   écarté au lieu d'en prendre l'identité.
   ⚠️ J3 — des annonces publiques, aucune donnée personnelle. J5 — aucune TVA. */
function sansAccentsTitre(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* Les mots d'accessoire, tirés des annonces réellement vues dans le balayage
   (raccords DCE5801, supports DCE5601, kit de conversion DCE560, dust box
   DWH302DH, piètements DE7033…). Un accessoire cite la référence de SA
   machine : sans cette variante, il écraserait le prix de la machine. */
const ACCESSOIRE = /(kit de conversion|raccord|couplage|support|pi[eè]tement|adaptateur|rechange|remplacement|replacement|dust box|sac d.aspirat|filtre|batterie de remplacement|moulage|insert|tube d.extrusion|ensemble de supports|legstand|coiffe|embase|semelle|carter|charbons?|courroie|mandrin de rechange|ersatz|zubeh[öo]r)/i;

/* ⛔ Faisceau de laser : le vert vaut plusieurs centaines d'euros de plus. */
const DISCRIMINANTS = [
  ['VERT', /\b(vert|verte|green)\b/],
  ['ROUGE', /\b(rouge|red)\b/]
];

/* ⛔⛔⛔ LE COFFRET N'EST PAS UNE IDENTITÉ, C'EST UN INTERRUPTEUR.
   RÈGLE DE L'USER, 04/08/2026, mot pour mot : « quand il y a N ou un T à la
   fin, le N correspond à nu et le T correspond à la MÊME machine avec le
   coffret ; si le début de la référence est pareil, et s'il n'y a rien de plus
   dans le titre à part ce putain de coffret, on est censé avoir ce même
   produit avec coffret et sans coffret sur la MÊME CARTE PRODUIT. »
   Mesuré : DCD800N-XJ et DCD800NT-XJ font deux cartes séparées, DCF850N /
   DCF850NT-XJ aussi — l'interrupteur de variante du site (`variantGroup`,
   `variantRole`, `coffretSku`, déjà utilisé par 38 fiches) ne servait à rien.
   ⛔ Le coffret sort donc de la clé d'identité et devient un RÔLE. */
const COFFRET = /\b(coffret|tstak|t-?stak|toughsystem|mallette|kitbox|case|koffer)\b/;

/* ⛔⛔⛔ LE COFFRET SE LIT D'ABORD DANS LA RÉFÉRENCE — RÈGLE DE L'USER :
   « N correspond à nu et T correspond à la MÊME machine avec le coffret ».
   Défaut mesuré le 04/08 : je ne cherchais le coffret que dans le TITRE, or
   les titres du catalogue sont du genre « DeWALT DCD800NT-XJ — Perceuse-
   visseuse 18V DCD800NT-XJ » : pas un mot sur le coffret. Résultat, 1 seul
   groupe fusionnable détecté sur 29. La lettre finale de la référence, elle,
   le dit toujours.
   ⚠️ On retire d'abord le marquage géographique (`-XJ`, `-QW`…) : c'est la
   région, jamais le produit. Ce qui reste après la racine est le suffixe
   commercial ; s'il finit par T, c'est la version coffret.
   ⚠️ Le titre reste consulté en RENFORT — une annonce marchande qui écrit
   « coffret TSTAK » sans le T dans la référence est bien un coffret. */
function roleCoffret(titre, sku) {
  const s = String(sku || '').toUpperCase().replace(/-[A-Z]{2,3}$/, '');
  const racine = racineModele(s);
  const suffixe = s.indexOf(racine) === 0 ? s.slice(racine.length) : '';
  if (/T$/.test(suffixe)) return 'coffret';
  return COFFRET.test(sansAccentsTitre(titre)) ? 'coffret' : 'solo';
}

/* ⛔⛔ « SANS BATTERIE NI CHARGEUR » N'EST PAS « AVEC CHARGEUR ».
   Défaut mesuré le 04/08 : `DCD800N-XJ — sans batterie ni chargeur` sortait en
   `PACK+CHARGEUR`, parce que je cherchais le MOT « chargeur » sans regarder ce
   qui le nie. Lire un mot n'est pas comprendre une phrase — c'est exactement
   ce que l'user reprochait : « réfléchir à ce que ça veut dire, pas juste le
   lire, sinon ça ne sert à rien ». */
const NEGATION = /\b(sans|ni|ohne|without|excl\.?|non fourni|non inclus|nu|nue|solo|body only|bare tool|machine seule|outil seul|appareil seul)\b/;

function nieApres(t, motif) {
  const m = t.match(motif);
  if (!m) return false;
  /* La négation porte sur ce qui SUIT : on regarde les 34 signes qui précèdent
     le mot, bornés à la ponctuation forte qui fermerait la proposition. */
  const avant = t.slice(Math.max(0, m.index - 34), m.index).split(/[.;(]/).pop();
  return NEGATION.test(avant);
}

/* ⛔⛔ « 2x batterie 2,0 Ah » VAUT DEUX BATTERIES, PAS UNE.
   Défaut mesuré : ma signature exigeait « 2x2,0Ah » collés ; dès qu'un mot
   s'intercale (« 2x **batterie** 2,0 Ah », « 2x **Batterie Powerstack** 1,7 Ah »)
   elle retombait sur la branche « une seule batterie » et écrivait 1X2.0 pour
   un pack de deux. Deux batteries de 5 Ah, ce n'est pas le même prix qu'une. */
/* ⛔⛔ LA RÉFÉRENCE COMPLÈTE LE TITRE QUAND LE TITRE SE TAIT. Demande de
   l'user, 04/08/2026 : « il faut absolument connaître TOUTES les références de
   pack avec batterie qui existent. » Mesuré sur son balayage : 725 titres sur
   1254 ne sont QUE la référence — sans ce lecteur, ces packs passaient pour
   des machines nues, et le prix d'un kit à deux batteries 5 Ah serait tombé
   sur une machine seule.
   ⚠️ Le TITRE reste prioritaire : c'est lui que l'user a désigné comme faisant
   foi. La référence ne parle que s'il n'a rien dit. */
function signatureDepuisReference(sku) {
  var r = nomen.lireSuffixeDewalt(sku);
  if (!r || !r.nbBatteries) return '';
  /* Une seule capacité : « 2X5 ». Plusieurs : on les écrit toutes, triées,
     pour que deux écritures du même contenu donnent la MÊME signature. */
  return r.batteries
    .map(function (b) { return b.nb + 'X' + b.ah; })
    .sort()
    .join('_');
}

function signatureBatteries(t) {
  if (nieApres(t, /batter/)) return 'SANSBAT';
  const m = t.match(/(\d)\s*[x×]\s*(?:[a-zà-ÿ\s]{0,24}?)?(\d+(?:[.,]\d)?)\s*ah\b/);
  if (m) return m[1] + 'X' + m[2].replace(',', '.');
  const seul = t.match(/(\d+(?:[.,]\d)?)\s*ah\b/);
  return seul ? '1X' + seul[1].replace(',', '.') : '';
}

/* ⛔ L'IDENTITÉ DU PRODUIT : la racine de modèle + CE QUE CONTIENT LA BOÎTE,
   lu dans le titre. Le coffret en est EXCLU (c'est un rôle, pas un produit). */
/* ⛔⛔⛔ « POUR <RÉFÉRENCE> » — L'ANNONCE PORTE LA RÉFÉRENCE D'UNE AUTRE
   MACHINE. L'user me l'avait corrigé le 04/08 : « bien sûr que c'est une
   référence produit, mais il faut LIRE LA DESCRIPTION avant ». La référence se
   GARDE — elle dit pour quelle machine l'article est fait — mais l'article
   n'est PAS cette machine.
   ⛔ ARGENT, attrapé à l'essai avant toute écriture : « 34° Clous en bande
   2,8x70mm POUR cloueur sans fil DeWalt DCN692 » à 95,50 € allait devenir le
   coût du cloueur DCN692N, vendu 1 076,33 € — le prix de vente serait tombé à
   163,12 €, un cinquième du coût réel de la machine. Idem « Rail de guidage
   1,5 m POUR DWS520KR » à 115,59 € pour une scie plongeante à 819,59 €.
   ⚠️ La garde ne mord QUE si la référence trouvée derrière « pour » est celle
   de l'article lui-même : sans ça, « batterie compatible avec tous les XR »
   ferait sortir des machines légitimes. */
function estPourAutreMachine(t, ref) {
  const r = String(ref || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (r.length < 5) return false;
  const nu = t.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ');
  const re = new RegExp('\\b(POUR|FUR|FOR|COMPATIBLE(?:\\s+AVEC)?|PASSEND)\\s+(?:[A-Z\\s]{0,34}?)?'
    + r.slice(0, 6), 'i');
  return re.test(nu.replace(/\s+/g, ' '));
}

function varianteProduit(titre, car, ref) {
  const c = car || {};
  const t = sansAccentsTitre(titre);
  if (ref && estPourAutreMachine(titre, ref)) return 'ACCESSOIRE';
  const m = t.match(ACCESSOIRE);
  if (m) {
    const avant = t.slice(Math.max(0, m.index - 8), m.index);
    if (!/(avec|with|mit|inkl\.?|\+)\s*$/.test(avant)) return 'ACCESSOIRE';
  }
  let bat = signatureBatteries(t);
  /* ⛔⛔ LE TITRE PRIME, ET SON SILENCE N'EST PAS UN REFUS. Règle de l'user :
     « ce qui prime c'est le TITRE de l'annonce plus le début de la référence ».
     Donc la référence ne parle QUE si le titre s'est tu (`bat` vide). Un titre
     qui dit « sans batterie ni chargeur » rend `SANSBAT` : c'est une réponse,
     et elle GAGNE contre le suffixe de la référence.
     ⚠️ Premier jet : je repliais aussi sur `SANSBAT`, et « DCD800D2 — sans
     batterie ni chargeur » ressortait avec deux batteries de 2 Ah. Le prix
     d'un kit serait tombé sur une machine nue. */
  if (!bat) {
    const parRef = signatureDepuisReference(ref);
    if (parRef) bat = parRef;
  }
  const chargeur = /\bchargeurs?\b|\bcharger\b|\blader\b/.test(t) && !nieApres(t, /chargeur|charger|lader/);
  const parts = [];
  /* Ni batterie ni chargeur ⇒ machine seule, quelle que soit la lettre finale
     de la référence. C'est le titre qui fait foi, comme l'a demandé l'user. */
  if ((!bat || bat === 'SANSBAT') && !chargeur) parts.push('NU');
  else {
    if (bat && bat !== 'SANSBAT') parts.push(bat);
    if (chargeur) parts.push('CHARGEUR');
  }
  /* ⛔⛔ LES DISCRIMINANTS S'APPLIQUENT AUSSI À UNE MACHINE NUE. Régression
     attrapée par la porte le 04/08 : un `return 'NU'` anticipé les sautait, et
     les deux lasers — rouge et vert, 430 € d'écart — redevenaient identiques.
     Ce qui distingue deux produits ne dépend pas de ce qu'il y a dans la
     boîte. */
  DISCRIMINANTS.forEach(function (d) { if (d[1].test(t)) parts.push(d[0]); });
  return parts.length ? parts.join('+') : 'NU';
}


/* ⛔⛔ L'IDENTITÉ D'UNE PAGE, TIRÉE DE SON CONTENU — parce que le raccourci ne
   dit JAMAIS quelle page il envoie. Sans ça, le serveur ne peut ni reconnaître
   une page envoyée deux fois, ni dire LAQUELLE des 67 manque : il ne sait que
   compter des requêtes. Mesuré le 03/08 : `pagesDansLaRafale: 53` sur 67 — un
   compte de requêtes, pas un compte de pages.

   ⛔ CE QU'ON PREND, ET POURQUOI PAS AUTRE CHOSE. Les montants de la page,
   ÉCHANTILLONNÉS SUR TOUTE SA HAUTEUR. Ni les premiers seuls, ni les derniers
   seuls : la tête et le pied de page portent des blocs communs à toutes les
   pages (l'user l'a dit le 03/08 — « il y a des produits en tête de page et au
   pied de page, mais cela ne compte pas »), et deux pages différentes s'y
   ressembleraient. Le milieu, lui, est propre à la page. Le nombre de tuiles
   entre aussi dans la graine.
   ⚠️ LIMITE ASSUMÉE, écrite pour ne pas être découverte plus tard : deux
   relevés de la MÊME page à deux jours d'écart n'ont pas la même empreinte si
   un prix a bougé. C'est sans effet sur l'usage — l'empreinte ne sert qu'à
   distinguer les pages D'UNE MÊME rafale — mais elle ne peut PAS servir de
   clé de suivi dans le temps.
   ⚠️ Une collision ferait SOUS-compter les pages (deux pages vues comme une) :
   elle se signale donc toute seule par un total inférieur, jamais par un total
   flatteur. C'est le bon sens de l'erreur.

   ⚠️ PORTE J4 LUE AVANT D'ÉCRIRE (`node scripts/juridique.js J4`). Le prix
   annoncé doit être exact et complet, et une réduction se réfère au prix le
   plus bas des 30 jours précédents. Cette fonction est HORS de ce chemin : elle
   ne rend qu'un entier de 32 bits, elle ne restitue aucun montant, n'en écrit
   aucun, et son résultat n'entre dans aucun calcul de prix ni de réduction —
   il ne sert qu'à distinguer deux pages l'une de l'autre. Elle ne peut donc
   pas fabriquer un prix de référence.
   ⚠️ J3 — dérivée de prix publics affichés par un comparateur, aucune donnée
   personnelle, jamais persistée. J5 — aucune TVA, aucun octroi de mer. */
var MONTANT_QUELCONQUE = /(\d[\d\s  ]*,\d{2})\s*€/;
var EMPREINTE_ECHANTILLONS = 16;
function empreintePage(rawText) {
  var lignes = stripHtml(rawText).split('\n');
  var montants = [];
  for (var i = 0; i < lignes.length; i++) {
    var m = MONTANT_QUELCONQUE.exec(lignes[i]);
    if (m) montants.push(m[1].replace(/[\s  ]/g, ''));
  }
  // Moins de quatre montants : ce n'est pas une page de comparateur, on ne
  // fabrique pas une identité sur du vide — l'appelant retombe sur son compte
  // de requêtes, en le sachant.
  if (montants.length < 4) return null;
  var n = Math.min(EMPREINTE_ECHANTILLONS, montants.length);
  var graine = [];
  for (var k = 0; k < n; k++) graine.push(montants[Math.floor(k * montants.length / n)]);
  graine.push('#' + compterTuiles(rawText).total);
  // FNV-1a 32 bits : court, stable, sans dépendance.
  var h = 0x811c9dc5;
  var s = graine.join('|');
  for (var j = 0; j < s.length; j++) {
    h ^= s.charCodeAt(j);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/* ⛔⛔ UN INSTRUMENT QUI CRIE AU LOUP FINIT IGNORÉ — ET LE JOUR OÙ IL A RAISON,
   PERSONNE NE L'ÉCOUTE. Son relevé du 03/08 : 60 tuiles sur 60 lues, tout
   juste, et ce rapprochement en annonçait DIX « non lues ». Toutes fausses.
   Cause : une FICHE ne se rapproche pas par son titre. La page écrit
   « DeWalt DWK301 (2 x 5,0 Ah + 2 x TSTAK VI) », le relevé rend
   « DEWALT DWK301 » — deux écritures du même article. Ce qui est stable entre
   les deux, c'est la RÉFÉRENCE.
   ⛔ On rapproche donc d'abord par référence, puis par titre. Et une ancre
   dont on n'a pas su tirer un titre exploitable (le repli est tombé sur « 35 »)
   n'est pas un produit perdu : c'est MON extraction qui a échoué. La compter
   comme une perte enverrait l'user chercher au mauvais endroit — elle est donc
   comptée à part, jamais tue.
   ⚠️ J4 : ce rapprochement ne touche à AUCUN prix. Il dit seulement ce qui n'a
   pas été lu — mais c'est bien de l'argent qu'il protège, puisqu'une tuile
   manquée est une source de prix manquée, donc un coût d'achat trop haut. */
function annoncesManquantes(rawText, titresRendus, refsRendues) {
  var clef = function (s) {
    return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 60).toUpperCase();
  };
  var normRef = function (r) { return String(r || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  /* Les références CRÉDIBLES d'un titre — mêmes critères que partout ailleurs :
     un chiffre, cinq signes au moins, jamais une unité. */
  var refsDe = function (s) {
    return (String(s || '').match(/\b[A-Z][A-Z0-9]{2,}(?:[-\/.][A-Z0-9]+)*\b/g) || [])
      .filter(function (r) {
        return /\d/.test(r) && r.length >= 5 && !UNITE_RE.test(r);
      }).map(normRef);
  };

  var reste = Object.create(null);
  (titresRendus || []).forEach(function (t) {
    var k = clef(t);
    if (k) reste[k] = (reste[k] || 0) + 1;
  });
  var vues = Object.create(null);
  (refsRendues || []).forEach(function (r) {
    var n = normRef(r);
    if (n) vues[n] = (vues[n] || 0) + 1;
  });

  var manquants = [], sansTitreExploitable = 0;
  titresAttendus(rawText).forEach(function (t) {
    var refs = refsDe(t);
    for (var i = 0; i < refs.length; i++) {
      if (vues[refs[i]] > 0) { vues[refs[i]]--; return; }        // rapproché par sa RÉFÉRENCE
    }
    var k = clef(t);
    if (reste[k] > 0) { reste[k]--; return; }                    // sinon par son TITRE
    /* Ni référence crédible, ni assez de lettres pour être un nom : ce n'est
       pas un produit, c'est mon repli qui a mal atterri. */
    if (!refs.length && String(t).replace(/[^A-Za-zÀ-ÿ]/g, '').length < 4) {
      sansTitreExploitable++;
      return;
    }
    manquants.push(String(t).slice(0, 110));
  });
  manquants.sansTitreExploitable = sansTitreExploitable;
  return manquants;
}

/* ⛔⛔ LE RACCOURCI PEUT ME RENVOYER MA PROPRE RÉPONSE. Mesuré le 03/08 sur
   son premier balayage des 67 pages : `octetsRecus: 1195` là où une page en
   fait treize mille, et les trois extraits du diagnostic étaient du JSON
   `{"ok":true,…,"diagnostic":…}` ré-échappé à chaque tour de boucle. Dans son
   raccourci, le champ `text` du POST pointait sur « Contenu de l'URL » — une
   variable qui, au tour suivant, désigne la sortie du POST PRÉCÉDENT et non
   la page qu'on vient de lire.
   ⛔ Sans cette détection, le diagnostic répondait « la marque apparaît 5×
   mais jamais suivie d'une référence — ce site écrit ses titres autrement » :
   une phrase juste sur le texte reçu, et une piste TOTALEMENT fausse. Elle
   l'aurait envoyé chercher du côté du parseur alors que le défaut est dans le
   câblage du raccourci. Un diagnostic qui désigne le mauvais coupable coûte
   plus cher que pas de diagnostic.
   ⚠️ On reconnaît la boucle à ce qu'elle a d'inimitable : notre propre
   réponse porte `"ok"` ET l'un de nos champs de sortie. Une page de
   comparateur n'écrit jamais ça. */
function estMaPropreReponse(rawText) {
  var s = String(rawText || '');
  if (s.length > 20000) return false;                 // une vraie page est longue
  var t = s.replace(/\\+/g, '').slice(0, 4000);       // le ré-échappement s'empile
  /* ⛔⛔ `boucleDetectee` EST LE MARQUEUR QUI MANQUAIT — ET SON ABSENCE A
     COÛTÉ UN ALLER-RETOUR À L'USER. Mesuré le 03/08 : ma réponse « boucle »
     ne porte AUCUN des autres champs de cette liste. Donc au tour suivant,
     quand le raccourci me la renvoyait à son tour, je ne la reconnaissais
     plus — le message d'aide sortait UNE fois, puis laissait la place au
     diagnostic générique qui accuse le parseur. Il recevait la mauvaise piste
     juste après avoir reçu la bonne.
     ⛔ Une réponse qui décrit un défaut doit se reconnaître ELLE-MÊME quand
     elle revient : sinon le diagnostic s'efface au moment où il sert le plus. */
  return /"ok"\s*:/.test(t)
    && /"(boucleDetectee|diagnostic|refsNonLues|annoncesNonLues|tuilesDansLaPage|sansRefDetail)"\s*:/.test(t);
}

function diagnostiquerPage(rawText, brand) {
  brand = brand || 'DEWALT';
  var texte = stripHtml(rawText).replace(/[ \t   ]+/g, ' ');
  function compter(re) { var m = texte.match(re); return m ? m.length : 0; }
  var d = {
    octetsRecus: String(rawText || '').length,
    texteNettoye: texte.length,
    boutonsPanier: compter(/Ajouter au panier/gi),
    occurrencesMarque: compter(new RegExp(escapeRe(brand), 'gi')),
    /* ⛔ CE COMPTEUR SURESTIMAIT, ET C'EST MOI QUI M'EN SUIS SERVI POUR DIRE
       « 11 références non lues ». Mesuré le 03/08 sur le corpus de sa page :
       le motif attrapait « DEWALT Vendu » — le mot qui suit la marque en fin
       de titre marchand — et, sur sa vraie page, les suggestions de recherche
       (« dewalt 18vpack », « dewalt tstak ») parce que le drapeau `i` rend
       `[A-Z0-9]` sensible aux minuscules.
       ⛔ Un instrument de mesure ne surestime JAMAIS. Il compte désormais des
       candidats CRÉDIBLES — exactement les critères d'une vraie réf : un
       chiffre, quatre signes au moins, jamais une unité — et il rend la LISTE
       en plus du nombre. Un écart NOMMÉ se corrige ; un écart chiffré se
       suppose. ⚠️ J4 : rien ici ne touche à un prix, on compte des identités. */
    refsMarque: 0, refsVues: [],
    prixAvecMot: compter(/Prix\s+[\d\s   ]+,\d{2}\s*\u20ac/g),
    prixVirgule: compter(/\d[\d\s   ]*,\d{2}\s*\u20ac/g),
    prixPoint: compter(/\d+\.\d{2}\s*\u20ac/g),
    extraits: []
  };
  /* Les candidats CR\u00c9DIBLES, d\u00e9doublonn\u00e9s. La casse compte ici : une vraie
     r\u00e9f\u00e9rence s'\u00e9crit en majuscules. \u00ab dewalt tstak \u00bb n'en est donc pas une,
     et \u00ab DEWALT Vendu \u00bb non plus (pas de chiffre). */
  /* ⚠️ DEUX SENSIBILITÉS DIFFÉRENTES DANS LE MÊME MOTIF. La MARQUE s'écrit
     « DeWalt », « DEWALT » ou « Dewalt » selon la ligne : elle se cherche donc
     sans tenir compte de la casse. La RÉFÉRENCE, elle, est en majuscules —
     c'est précisément ce qui distingue « DCS572P2 » de « tstak ». Un seul
     motif avec le drapeau `i` rendait les deux insensibles, et laissait entrer
     les suggestions de recherche ; sans le drapeau, il ne trouvait plus rien
     du tout parce que la marque n'est presque jamais en capitales. */
  var vus = Object.create(null);
  var reMarque = new RegExp(escapeRe(brand), 'gi');
  var reSuite = /^\s+([A-Z0-9][A-Z0-9.\/\-]*[A-Z0-9])/;
  var mr;
  while ((mr = reMarque.exec(texte)) !== null) {
    var suite = texte.slice(mr.index + mr[0].length, mr.index + mr[0].length + 40).match(reSuite);
    if (!suite) continue;
    var cand = suite[1].toUpperCase();
    if (!/\d/.test(cand) || cand.length < 4 || UNITE_RE.test(cand)) continue;
    vus[cand] = 1;
  }
  d.refsVues = Object.keys(vus).sort();
  d.refsMarque = d.refsVues.length;

  /* Trois fen\u00eatres de texte brut autour de la marque \u2014 d\u00e9but, milieu, fin de
     page \u2014 pour VOIR comment le site \u00e9crit titre, r\u00e9f et prix. */
  var pos = [], re = new RegExp(escapeRe(brand), 'gi'), m;
  while ((m = re.exec(texte)) !== null) pos.push(m.index);
  [0, Math.floor(pos.length / 2), pos.length - 1].forEach(function (i) {
    if (i < 0 || i >= pos.length) return;
    var ext = texte.slice(Math.max(0, pos[i] - 60), pos[i] + 140).trim();
    if (d.extraits.indexOf(ext) === -1) d.extraits.push(ext);
  });
  /* Verdict MESUR\u00c9 \u2014 chaque phrase d\u00e9coule d'un compte ci-dessus, dans
     l'ordre o\u00f9 le parseur \u00e9choue. */
  if (!d.occurrencesMarque) {
    d.verdict = 'la marque \u00ab ' + brand + ' \u00bb n\'appara\u00eet nulle part dans le texte re\u00e7u \u2014 '
      + 'mauvaise page, ou contenu construit par JavaScript (le raccourci ne re\u00e7oit que le HTML brut)';
  } else if (!d.refsMarque) {
    d.verdict = 'la marque appara\u00eet (' + d.occurrencesMarque + '\u00d7) mais JAMAIS suivie d\'une '
      + 'r\u00e9f\u00e9rence \u00ab ' + brand + ' XXX \u00bb \u2014 ce site \u00e9crit ses titres autrement (les extraits le montrent)';
  } else if (!d.prixAvecMot) {
    d.verdict = 'des r\u00e9f\u00e9rences sont l\u00e0 (' + d.refsMarque + '), mais aucun \u00ab Prix X,XX \u20ac \u00bb \u2014 '
      + 'ce site \u00e9crit ses prix sans le mot \u00ab Prix \u00bb (' + d.prixVirgule + ' prix \u00e0 virgule, '
      + d.prixPoint + ' \u00e0 point, dans le texte)';
  } else if (!d.boutonsPanier) {
    d.verdict = 'r\u00e9f\u00e9rences et prix pr\u00e9sents, mais aucun \u00ab Ajouter au panier \u00bb \u2014 '
      + 'le d\u00e9coupage en cartes ne peut pas fonctionner sur ce site';
  } else {
    d.verdict = 'tous les motifs existent s\u00e9par\u00e9ment mais aucune carte ne les r\u00e9unit \u2014 '
      + 'les extraits montrent l\'agencement r\u00e9el';
  }
  return d;
}

/* ── PLUSIEURS TRAQUEURS, UN SEUL COÛT : LE MOINS CHER DES SOURCES VALIDES ──
   Demandé par l'user le 01/08/2026 : un deuxième site va être traqué, puis
   d'autres. Le calculateur doit TOUJOURS s'appuyer sur le moins cher — mais
   seulement parmi les sources où l'on peut RÉELLEMENT acheter :

     · une source EN RUPTURE (enStock === false) ne compte pas — on ne peut
       pas s'approvisionner à ce prix ;
     · une source PÉRIMÉE ne compte pas non plus : les traqueurs passent
       2×/jour ; un relevé plus vieux que SOURCE_FRESH_MS veut dire que le
       produit a quitté la page (souvent : rupture retirée de la grille).

   `sources` : { slug: { ttc, at, enStock } } — la carte `priceSources` d'un
   override. Rend { ttc, source } ou null s'il n'existe AUCUNE source achetable.
   PURE — testée par check-price-watch, sabotage compris. */
var SOURCE_FRESH_MS = 14 * 24 * 3600 * 1000;   // 14 jours ≈ 28 passages manqués

/* ⛔⛔ LES SOURCES QUI COMPTENT ENCORE — UN SEUL ENDROIT, FAIT POUR CHANGER.
   Décision de l'user, ses mots (03/08/2026, registre D-112) : « au final on ne
   gardera qu'un seul traqueur, celui d'idealo, et ça pour toutes les marques ».
   Gravée en DÉCISION le 09/08/2026 (D-022) parce qu'elle n'était appliquée
   NULLE PART dans le calcul du coût.
   ⛔ POURQUOI ÇA NE POUVAIT PAS ATTENDRE LA PÉREMPTION : le coût retenu est le
   MINIMUM des sources fraîches. Le relevé d'un traqueur abandonné restait donc
   GAGNANT tant qu'il n'avait pas 14 jours — c'est exactement le défaut signalé
   par l'user (D-58 : 44,00 € d'un côté contre 119,32 € de l'autre, même
   article). Un coût faux fabrique un prix faux, à la baisse comme à la hausse.
   ⚠️ ON ÉCARTE, ON N'EFFACE PAS (règle du projet) : les relevés des sources
   retirées RESTENT dans `priceSources`, ils sortent seulement du calcul. Le
   jour où une source revient, on la remet dans cette liste et ses relevés
   reprennent leur rôle sans que rien n'ait été perdu.
   ⛔ POUR EN RÉACTIVER UNE : ajouter son slug ici. Rien d'autre, nulle part. */
var SOURCES_ACTIVES = { idealo: 1 };
function sourceActive(slug) {
  return Object.prototype.hasOwnProperty.call(SOURCES_ACTIVES, String(slug));
}

/* ⚠️ HORODATAGES : MILLISECONDES, ET RIEN D'AUTRE — appris en production le
   01/08/2026 au soir. Les `at` écrits via `serverTimestamp()` partaient en
   SENTINEL (Number → NaN : l'entrée du passage EN COURS était invisible au
   min — mesuré sur D25033K-QS : clickoutil 119,90 € perdu contre cotébrico
   126,72 €) et revenaient de Firestore en objet `Timestamp` (Number →
   63 889 596 800, des secondes d'une autre ère : comparé à Date.now() en ms,
   tout paraissait périmé → GEL fantôme au recalcul). D'où `enMillis` : un
   nombre est pris tel quel, un Timestamp est lu par son `.toMillis()`, tout
   le reste vaut 0 — donc écarté, jamais deviné. */
function enMillis(v) {
  if (v && typeof v.toMillis === 'function') { try { return Number(v.toMillis()) || 0; } catch (e) { return 0; } }
  var n = Number(v);
  return (isFinite(n) && n > 0) ? n : 0;
}

function choisirCoutSource(sources, nowMs, maxAgeMs, actives) {
  if (!sources || typeof sources !== 'object') return null;
  if (!(Number(nowMs) > 0)) return null;   // un « maintenant » non numérique ne date rien
  var age = (typeof maxAgeMs === 'number' && maxAgeMs > 0) ? maxAgeMs : SOURCE_FRESH_MS;
  /* ⚠️ CONFIG INJECTABLE, DÉFAUT = LA CONFIG RÉELLE (même patron que le modèle
     de prix). La production n'injecte RIEN : elle prend `SOURCES_ACTIVES`. Le
     paramètre n'existe que pour que la logique PURE du minimum reste éprouvable
     avec des noms synthétiques — sans lui, le jour où il ne reste qu'une seule
     source en service, plus aucun harnais ne pourrait tester « le moins cher
     gagne ». ⛔ Il ne sert JAMAIS à desserrer la règle en production. */
  var act = (actives && typeof actives === 'object') ? actives : SOURCES_ACTIVES;
  var best = null;
  Object.keys(sources).forEach(function (slug) {
    var e = sources[slug] || {};
    var ttc = Number(e.ttc);
    if (!(ttc > 0)) return;
    /* ⛔ SOURCE RETIRÉE : son relevé reste écrit, il ne pèse plus (D-022). */
    if (!Object.prototype.hasOwnProperty.call(act, slug)) return;
    if (e.enStock === false) return;                    // en rupture : inachetable
    var at = enMillis(e.at);
    if (!(at > 0) || (nowMs - at) > age) return;        // périmée ou indatable
    if (!best || ttc < best.ttc) best = { ttc: ttc, source: slug };
  });
  return best;
}

/* ══ POURQUOI AUCUNE SOURCE N'A ÉTÉ RETENUE ═══════════════════════════════
   ⛔ Défaut nommé par l'user le 03/08 : « les articles sur ces pages peuvent
   changer chaque jour, mais l'URL reste la bonne ». Conséquence directe, et
   MESURÉE : sa liste est triée par prix, les prix bougent tous les jours, et
   un article sort donc de la fenêtre balayée sans rien avoir de particulier.
   Au bout de 14 jours sans le revoir, son relevé se périme et le produit est
   GELÉ — ce qui est le BON comportement : un coût vieux de deux semaines
   n'est plus un coût.

   ⛔ MAIS IL ÉTAIT ÉTIQUETÉ « rupture ». Or « rupture » veut dire : le
   fournisseur ne l'a plus. Un article qui a simplement quitté la fenêtre de
   prix n'est pas en rupture, et l'écran d'admin l'affirmait à tort. Le gel
   reste identique — c'est la RAISON qui devient vraie. Un diagnostic faux
   fait chercher au mauvais endroit, et ça coûte du temps à chaque fois.

   Rend : 'rupture' (des relevés existent, tous marqués hors stock) ·
   'perime' (des relevés existent, tous plus vieux que la fenêtre) ·
   'mixte' (les deux causes présentes) · null (rien d'exploitable, ou il
   restait une source valable — dans les deux cas il n'y a rien à expliquer). */
function raisonAucuneSource(sources, nowMs, maxAgeMs, actives) {
  if (!sources || typeof sources !== 'object') return null;
  var age = (typeof maxAgeMs === 'number' && maxAgeMs > 0) ? maxAgeMs : SOURCE_FRESH_MS;
  var act = (actives && typeof actives === 'object') ? actives : SOURCES_ACTIVES;
  var horsStock = 0, perimes = 0, exploitables = 0, retirees = 0;
  Object.keys(sources).forEach(function (slug) {
    var e = sources[slug] || {};
    if (!(Number(e.ttc) > 0)) return;
    exploitables += 1;
    /* ⛔ UN DIAGNOSTIC FAUX FAIT CHERCHER AU MAUVAIS ENDROIT (règle déjà payée
       une fois sur « rupture » vs « perime »). Un produit dont le seul relevé
       vient d'un traqueur RETIRÉ n'est ni en rupture ni périmé : il attend
       simplement d'être vu par le traqueur en service. On le dit. */
    if (!Object.prototype.hasOwnProperty.call(act, slug)) { retirees += 1; return; }
    if (e.enStock === false) { horsStock += 1; return; }
    var at = enMillis(e.at);
    if (!(at > 0) || (Number(nowMs) - at) > age) perimes += 1;
  });
  if (!exploitables) return null;
  if (horsStock && perimes) return 'mixte';
  if (horsStock) return 'rupture';
  if (perimes) return 'perime';
  if (retirees) return 'source-retiree';
  return null;
}

/* ══ CARACTÉRISTIQUES D'UN TITRE FOURNISSEUR ═══════════════════════════════
   Écrit le 03/08/2026, et la critique de l'user était juste : « il doit
   comparer le voltage, le nom propre d'un outil, la référence, si c'est un
   pack ou pas, avec fil ou à batterie, le nombre de batteries… ne recoupe pas
   avec deux ou trois informations. »

   Le parseur ne lisait que réf + prix. Conséquence : la moitié d'une page —
   les OFFRES MARCHANDES, dont les titres sont pourtant les plus riches —
   partait à la poubelle par prudence, faute de pouvoir décider. Or ces titres
   portent tout ce qu'il faut pour décider vraiment :

     Débroussailleuse 54V DCMST922N-XJ + 1 batterie 54V 12 Ah + 1 chargeur DCB118
        ↑ type        ↑ V   ↑ réf        ↑ lot ↑ nb        ↑ Ah    ↑ chargeur

   ⛔ CE QUE ÇA CHANGE POUR L'ARGENT. On ne jette plus : on QUALIFIE. Un titre
   marqué `pack:true` porte batterie et chargeur ; son prix ne peut donc
   s'écrire que sur une fiche elle-même vendue en pack. La règle « un prix de
   pack ne s'écrit jamais sur la réf d'un composant » cesse d'être un pari sur
   la forme du titre : elle devient une comparaison de caractéristiques.

   ⚠️ Rend `null` sur tout champ NON TROUVÉ. Un champ absent n'est jamais un
   champ à zéro : « voltage inconnu » et « 0 V » ne se comparent pas de la même
   façon, et les confondre ferait apparier n'importe quoi. */
/* ⛔ CE N'EST PAS UNE BOUTIQUE DE VISSEUSES. Reproche de l'user, 03/08 :
   « pour la quincaillerie il n'y aura pas de référence, pas de voltage ni rien
   de tout ça ; il y aura la taille, ou l'alésage des circulaires avec le
   diamètre. Pour les chaussures de sécurité c'est pareil, les pantalons de
   travail c'est pareil. »

   Le vocabulaire a donc quitté ce fichier : il vit dans `nomenclature.js`,
   rangé en ENTONNOIR — famille → rayon → type → mesures autorisées. 216 types,
   715 écritures, 39 rayons, construits le 03/08 sur ses 1 226 fiches ET sur
   une recherche en ligne (sources en tête de ce fichier-là).

   ⛔ CE QUE L'ENTONNOIR CHANGE. Avant, l'extracteur cherchait TOUT partout :
   il lisait « 43 » dans « pointure 43 » et se demandait si c'était un
   voltage. Désormais chaque rayon déclare les seules mesures qui ont un sens
   chez lui, et `nomen.mesureAutorisee` efface le reste. Une chaussure n'a pas
   de voltage — ce n'est plus une espérance, c'est une règle exécutée. */
var nomen = require('./nomenclature.js');
var OUTILS = nomen.INDEX.map(function (e) { return e.libelle; });
var SERIES = Object.keys(nomen.GAMMES).map(function (g) { return g.toLowerCase(); });
var BOITES = /\b(t-?\s?stak|tough\s?system|makpac|systainer|l-?boxx|tanos)\b/;
var CONDITIONNEMENT = new RegExp('\\b(' + nomen.CONDITIONNEMENTS.join('|') + ')s?\\s+de\\s+(\\d+)\\s*', 'i');
var NUANCES = nomen.NUANCES;
var MATIERES = nomen.MATIERES;
var EMMANCHEMENTS = nomen.EMMANCHEMENTS;
var EMPREINTES = nomen.EMPREINTES;
var DENTURES = nomen.DENTURES;
var FORMES_DISQUE = nomen.FORMES_DISQUE;
var MACHINE_NUE_RE = new RegExp('\\b(' + nomen.MACHINE_NUE.map(function (m) {
  return m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}).join('|') + ')\\b');

var SERIES = ['flexvolt', 'powerstack', 'xtreme', 'atomic', 'powerdetect', 'xr', 'lxt', 'cxt', 'xgt'];
var BOITES = /\b(t-?\s?stak|tough\s?system|makpac|systainer|l-?boxx|tanos)\b/;

/* ⛔ `\b` NE MARCHE PAS SUR DU FRANÇAIS : il est ASCII, donc « \bégoïne » ou
   « débroussailleuse\b » se comportent autrement qu'on croit dès qu'un accent
   touche la bordure. Et `indexOf` tout court est pire : il a trouvé « kit »
   dans « maKITa » et rendu le type « kit » pour toute machine de la marque.
   D'où cette borne explicite : ni lettre latine, ni chiffre, de chaque côté. */
var LETTRE = 'a-zà-öø-ÿ0-9';
/* ⛔ LES ACCENTS NE SONT PAS FIABLES DANS UN TITRE FOURNISSEUR. Mesuré sur
   son catalogue : « Elagueuse sur perche 18V » — sans accent — n'était jamais
   reconnue, alors que « élagueuse » figure au vocabulaire. Les deux côtés sont
   donc dépouillés de leurs signes avant comparaison ; le type RENDU garde,
   lui, son orthographe correcte. */
function sansAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function motEntier(basseCasse, mot) {
  return reMot(mot).test(sansAccents(basseCasse));
}
/* Les mots qui annoncent un LOT, dans les trois langues de ses pages.
   ⛔ Bornés comme tout le reste : « pack » se trouve dans « PowerSTACK » et
   « kit » dans « maKITa » — c'est ce piège-là qui avait typé « kit » toutes
   les machines de la marque. Ni lettre ni chiffre de chaque côté. */
var MOT_LOT = new RegExp('(?:^|[^' + LETTRE + '])(kits?|packs?|lots?|ensembles?|combos?|sets?|juegos?|conjuntos?)(?![' + LETTRE + '])');
/* ⛔ SÉRIE LIMITÉE — le texte est comparé SANS ACCENTS et en minuscules (`bas`),
   d'où « limitee » sans accent ici. Les trois langues du corpus sont couvertes :
   idealo mélange des annonces françaises, anglaises et allemandes sur la même
   page, et une garde qui ne tient que dans une langue ne tient pas.
   ⚠️ DEUX protections indépendantes contre « unlimited », et il faut les DEUX :
   on exige la LOCUTION (« limited edition », jamais « limited » seul) ET une
   borne de mot en tête. Mesuré au sabotage le 03/08 : retirer l'une OU l'autre
   laisse le contrôle vert — seul le retrait des deux le fait rougir. Ce n'est
   pas de la redondance mais de la défense en profondeur : l'une couvre un motif
   raccourci, l'autre un ancrage trop lâche. Retirer une seule des deux est donc
   invisible aux portes : les changer demande de relire cette note. */
var EDITION_LIMITEE = new RegExp('(?:^|[^' + LETTRE + '])('
  + 'editions?\\s+limitees?|limited\\s+editions?|sonderedition|limitierte\\s+auflage'
  + '|serie\\s+limitee|mclaren'
  + ')(?![' + LETTRE + '])');
/* Le pluriel se met sur CHAQUE mot du terme : « lames de scie sabre » doit
   accrocher « lame de scie sabre ». Un `s?` global à la fin ne suffisait pas. */
function reMot(mot) {
  var corps = escapeRe(sansAccents(mot)).split(/\s+/).join('s?\\s+') + 's?';
  return new RegExp('(?:^|[^' + LETTRE + '])' + corps + '(?![' + LETTRE + '])');
}
/* ⛔ LE TYPE SE CHOISIT PAR LA CORRESPONDANCE LA PLUS LONGUE, jamais par
   l'ordre de la liste. Mesuré sur son catalogue : « Rainureuse à double disque
   Ø180 mm en coffret » contient trois termes (rainureuse · disque · coffret).
   Un ordre fixe se trompe forcément sur l'un des trois titres ; le terme le
   plus long est celui qui décrit vraiment l'article. */
function typerTitre(bas) {
  var meilleur = null, vu = 0, nu = sansAccents(bas);
  for (var i = 0; i < nomen.INDEX.length; i++) {
    var e = nomen.INDEX[i];
    if (e.libelle.length <= vu) continue;          // déjà battu : inutile de tester
    if (!reMot(e.libelle).test(nu)) continue;
    vu = e.libelle.length;
    meilleur = { famille: e.famille, rayon: e.rayon, type: e.type };
  }
  return meilleur;
}
/* Cherche un libellé canonique dans une table {CANON: [écritures]} et rend la
   CLÉ, pas l'écriture trouvée. Le plus long gagne, pour la même raison que
   ci-dessus : « sds-max » doit battre « sds ». */
function chercherTable(bas, table) {
  var trouve = null, vu = 0, cles = Object.keys(table);
  for (var i = 0; i < cles.length; i++) {
    var ecritures = table[cles[i]];
    for (var j = 0; j < ecritures.length; j++) {
      if (ecritures[j].length <= vu) continue;
      if (!motEntier(bas, ecritures[j])) continue;
      vu = ecritures[j].length; trouve = cles[i];
    }
  }
  return trouve;
}

function extraireCaracteristiques(titre, brand) {
  var t = String(titre || '').replace(/[ \t   ]+/g, ' ');
  var bas = t.toLowerCase();
  var car = {
    famille: null, rayon: null, type: null, prefixe: null, typeRejete: null,
    sku: null, skuEclate: null, serie: null,
    // — machines
    voltage: null, voltageSecteur: null, ah: null,
    nbBatteries: null, nbOutils: null, chargeur: false, coffret: null,
    pack: false, sansFil: null, brushless: null, watts: null,
    // — consommables et quincaillerie
    nbPieces: null, conditionnement: null, pourMachine: null,
    diametreMm: null, alesageMm: null,
    dimensionsMm: null, cotesMm: null, longueurMm: null, longueurM: null, pouces: null,
    nbDents: null, denture: null, grain: null, nuance: null, matiere: null,
    emmanchement: null, empreinte: null, formeDisque: null,
    // — EPI et vêtement de travail
    taille: null, pointure: null, tailleGant: null, normeEpi: null,
    // — commun
    poidsKg: null, bars: null, litres: null
  };
  if (!t) return car;

  /* ── Référence contiguë : un bloc majuscules+chiffres, assez long, jamais
     une unité ni un nom de gamme (« FLEXVOLT », « T-STAK » ne sont pas des
     réfs). C'est la SEULE forme qu'on ose appeler `sku`. */
  var refs = t.match(/\b[A-Z][A-Z0-9]{2,}(?:[-\/.][A-Z0-9]+)*\b/g) || [];
  for (var r = 0; r < refs.length; r++) {
    var cand = refs[r].toUpperCase();
    if (cand === String(brand || '').toUpperCase()) continue;      // la marque
    if (!/\d/.test(cand) || cand.length < 5) continue;             // une réf porte un chiffre
    if (UNITE_RE.test(cand)) continue;                             // « 18V-54V » n'est pas une réf
    if (/^(TSTAK|T-STAK|TOUGHSYSTEM|MAKPAC|SYSTAINER|FLEXVOLT|POWERSTACK|LI-?ION|XGT|LXT)/.test(cand)) continue;
    car.sku = cand; break;
  }

  /* ⚠️ Référence ÉCLATÉE PAR DES ESPACES : « DXPW 003 E », « DCS 579 T2T ».
     Mesuré sur la page réelle : 2 cartes sur 9. On la recolle, mais dans un
     champ SÉPARÉ et jamais dans `sku` — parce qu'on ne sait pas si le vrai
     code est DCS579T2T ou DCS579T2. Un recollage sert à RAPPROCHER deux
     annonces entre elles ; il ne sert jamais à écrire un prix sur une fiche. */
  if (!car.sku) {
    var me = t.match(/\b([A-Z]{2,5})\s+(\d{2,4})\s*([A-Z][A-Z0-9]{0,4})?\b/);
    /* ⛔ UNE NORME N'EST PAS UNE RÉFÉRENCE. « EN 388 » sur un gant devenait
       le sku « EN388 » — et deux gants de normes différentes se seraient
       comparés par une réf que le fabricant n'a jamais écrite. */
    /* ⛔ RÈGLE DE L'USER, 04/08/2026, après une fausse route corrigée deux fois
       dans la même heure : « Kit de conversion … pour DCE 560 » PORTE bien la
       référence DCE560 — elle dit pour quelle machine l'accessoire est fait,
       et elle se GARDE. Ce qui distingue l'accessoire de la machine, c'est la
       DESCRIPTION (« kit de conversion », « raccord », « support »), jamais la
       position de la référence dans la phrase. J'avais d'abord voulu jeter la
       référence derrière « pour » : faux, ça aurait rendu l'annonce muette.
       La séparation accessoire/machine se fait au CLASSEMENT — `varianteProduit`
       dans scripts/classer-idealo.js — sur le texte de l'annonce. */
    if (me && !/^(EN|ISO|NF|CE|FFP|DIN|ANSI)$/i.test(me[1])) {
      car.skuEclate = (me[1] + me[2] + (me[3] || '')).toUpperCase();
    }
  }

  /* ── Conditionnement. « Coffret de 29 forets métal » : le NOMBRE est celui
     des pièces, et le mot « coffret » est le CONTENANT — pas le type. On le
     retire du texte AVANT de typer, sans quoi tout lot de consommables serait
     rangé dans « rangement ». */
  var sansCond = bas, mCond = bas.match(CONDITIONNEMENT);
  if (mCond) {
    car.conditionnement = mCond[1].toLowerCase();
    car.nbPieces = parseInt(mCond[2], 10);
    sansCond = bas.replace(CONDITIONNEMENT, ' ');
  }

  /* ⛔ « POUR X » DÉSIGNE LA MACHINE DE DESTINATION, PAS L'ARTICLE. Mesuré
     sur son catalogue : « Lot de 5 lames 30x43 mm pour multi-cutter Métal »
     était typé MULTI-CUTTER, famille machine — donc un jeu de lames à 20 €
     pouvait s'apparier à une machine à 300 €. Le segment « pour … » sort du
     typage et devient son propre champ. */
  var mPour = sansCond.match(/\bpour\s+([^,(]{2,45})/);
  var aTyper = sansCond;
  if (mPour) {
    car.pourMachine = mPour[1].replace(/\s+\S*\d\S*.*$/, '').trim() || null;
    aTyper = sansCond.replace(/\bpour\s+[^,(]{2,45}/, ' ');
  }

  /* ⛔⛔ CE QUI SUIT UN « + » EST LE LOT, PAS L'ARTICLE. Défaut mesuré le
     03/08 sur son catalogue : « Scie sauteuse DCS335NT-XJ + 2 batteries +
     1 chargeur rapide » était typée CHARGEUR, et « Laser 3 lignes + 1
     batterie » typée BATTERIE — 13 fiches au total. Le mot le plus long
     gagnait, et il appartenait au lot. Une parenthèse joue le même rôle :
     « DCH333 (1x Batterie 9 Ah + Chargeur DCB118) ».
     ⚠️ SEUL LE TYPAGE utilise ce texte élagué. Les batteries, le chargeur,
     le coffret et les Ah continuent de se lire sur le titre ENTIER — sinon
     on perdrait précisément ce qui fait le prix d'un lot. */
  /* ⛔ LE « & » EST UN « + » ÉCRIT AUTREMENT. Mesuré le 09/08/2026 sur le
     relevé idealo Quincaillerie de l'user : « Affleureuse Défonceuse Brushless
     XR 18V - Plongée 55mm & Coffret 22 Fraises » sortait `consommable/fraise`
     — la machine typée par les fraises de son lot — et « Souffleur … &
     Recharge de Fil Coupe Bordure » sortait `fil de débroussailleuse`. Même
     mécanisme que le « + » : ce qui suit l'esperluette est le lot, pas
     l'article. ⚠️ Comme pour le « + », SEUL LE TYPAGE est élagué — batteries,
     Ah et coffret continuent de se lire sur le titre ENTIER. */
  var elague = aTyper.replace(/\([^)]*\)/g, ' ').replace(/\s[+&].*$/, ' ').trim();
  if (elague.length >= 8) aTyper = elague;
  /* ⛔ « … ET/AVEC COFFRET DE TRANSPORT » DÉCRIT L'EMBALLAGE, PAS L'ARTICLE.
     Mesuré le 09/08/2026, même relevé : « Scie Sabre Électrique avec Vitesse
     Variable et Coffret de Transport » sortait `rangement/coffret` parce que
     « coffret de transport » est une entrée du vocabulaire PLUS LONGUE que
     « scie sabre » — et la plus longue gagne. Précédé de « et »/« avec », ce
     segment ACCOMPAGNE l'article : il sort du typage. Un « Coffret de
     transport » vendu SEUL (sans et/avec devant) reste typé coffret. */
  aTyper = aTyper.replace(/\b(?:et|avec)\s+(?:son\s+)?coffret\s+de\s+transport\b/g, ' ');
  // ── Nom propre de l'article, par correspondance la plus longue (mot entier).
  var typ = typerTitre(aTyper) || typerTitre(sansCond) || typerTitre(bas);
  if (typ) { car.famille = typ.famille; car.rayon = typ.rayon; car.type = typ.type; }
  else if (car.conditionnement) {
    car.famille = 'rangement'; car.rayon = 'coffret'; car.type = car.conditionnement;
  }

  /* ══ LE PRÉFIXE DE RÉFÉRENCE ARBITRE ══════════════════════════════════
     Reproche de l'user, 03/08 : « je n'ai absolument rien vu qui référence
     le DÉBUT des références ». Le préfixe est écrit par le CONSTRUCTEUR :
     il ne change pas de langue, et il survit là où le vocabulaire échoue.

     Deux emplois, dans cet ordre :
     ① SECOURS — aucun mot reconnu (titre en espagnol, en anglais, ou réduit
        à sa seule référence) : le préfixe donne la famille, et le rayon
        quand il n'en désigne qu'un. Il n'invente JAMAIS de type.
     ② ARBITRE — le vocabulaire a répondu, mais dans une AUTRE FAMILLE que
        le préfixe. Mesuré sur sa page : « DEWALT Martillo Electroneumático
        … y maletín TSTAK » était typé COFFRET, parce que « TSTAK » était le
        seul mot que je savais lire. Un marteau rangé dans une boîte reste
        un marteau ; le préfixe, lui, ne se trompe pas de famille.

     ⚠️ J4 — aucun prix ici : on classe un article, on n'en fixe pas la
     valeur. Le coût d'achat reste celui que la page annonce. */
  /* ⛔⛔ CETTE TABLE EST CELLE DE DeWALT, ET D'ELLE SEULE. Défaut mesuré à la
     minute où je l'ai branchée : le catalogue est tombé de 1 119 fiches
     typées à 1 049. Cause — « Makita DTW700Z » commence par « DT », que la
     table DeWALT lit « accessoire » ; l'arbitre effaçait donc le type
     « boulonneuse » sur des dizaines de fiches Makita. Un préfixe n'a de sens
     que dans la nomenclature de SA marque. */
  var estDewalt = /^dewalt$/i.test(String(brand || '').replace(/[\s-]/g, ''));
  var pref = estDewalt ? nomen.prefixeDeReference(car.sku || car.skuEclate || '') : null;
  if (pref) {
    car.prefixe = pref.prefixe;
    /* ⛔⛔ UN TITRE DE MARCHAND PEUT ÊTRE FAUX ; UNE RÉFÉRENCE, NON. Trouvé le
       03/08 en auditant son relevé contre la réalité DeWALT : deux lignes
       vendaient une « Dégauchisseuse sans fil DCW 620 » — machine d'atelier —
       pour une DÉFONCEUSE plongeante (« Oberfräse » mal traduit), et une
       troisième, MÊME référence, disait « Défonceuse » et avait raison. Idem
       pour « Coupe-bordures … DCMBC723N, avec guidon », qui est une
       débroussailleuse forestière. Trois lignes sur cinquante-neuf.
       ⛔ LE CRITÈRE EST SIMPLE : une entrée qui porte un `type` NOMME l'objet,
       sourcée et datée. Elle arbitre donc, même quand la famille concorde. Les
       entrées de FAMILLE (DCS, DCF, DCW…) n'en portent pas — elles couvrent
       des dizaines d'outils — et laissent le nom écrit gagner. La lecture du
       plus LONG au plus court fait le reste : `DCW620` passe avant `DCW`.
       ⚠️ Premier jet : un drapeau `precis` séparé. Le sabotage qui le retirait
       est RESTÉ VERT — normal, seules les entrées précises portent un type, et
       le drapeau ne distinguait donc rien. Un drapeau qu'aucune mesure ne
       sépare de son voisin est une décoration : supprimé.
       ⚠️ Le type écarté reste dans `typeRejete` : une correction qu'on ne peut
       pas relire n'est pas vérifiable. */
    if (pref.type && car.type !== pref.type) {
      if (car.type) car.typeRejete = car.type;
      car.famille = pref.famille;
      car.rayon = pref.rayon || null;
      car.type = pref.type;
    } else if (!car.type) {
      car.famille = pref.famille;
      if (pref.rayon) car.rayon = pref.rayon;
      if (pref.type) car.type = pref.type;
    } else if (car.famille !== pref.famille && !pref.incertain) {
      /* ⚠️ On ne garde pas un type qui appartient à la famille contredite :
         il serait faux. On rend la famille du constructeur et on EFFACE le
         type — un vide se voit, un type faux se propage. Le type rejeté est
         conservé à part, pour que la correction soit vérifiable. */
      car.typeRejete = car.type;
      car.famille = pref.famille;
      car.rayon = pref.rayon || null;
      car.type = pref.type || null;
    }
  }

  // ── Gamme : elle commande la compatibilité batterie, donc le prix d'un lot.
  for (var s = 0; s < SERIES.length; s++) {
    if (motEntier(bas, SERIES[s])) { car.serie = SERIES[s].toUpperCase(); break; }
  }

  /* ── Voltage. Un titre en mélange DEUX : celui de l'outil (≤ 60 V) et celui
     du secteur (« chargeur 230 V »). Prendre le maximum brut ferait passer une
     visseuse 18 V pour du 230 V. On sépare les deux domaines. */
  var volts = [], mv, reV = /(\d{1,3})\s*V\b/gi;
  while ((mv = reV.exec(t)) !== null) {
    var v = parseInt(mv[1], 10);
    if (v >= 4 && v <= 400) volts.push(v);
  }
  var surBatterie = volts.filter(function (x) { return x <= 60; });
  var surSecteur  = volts.filter(function (x) { return x >= 100; });
  if (surBatterie.length) car.voltage = Math.max.apply(null, surBatterie);
  if (surSecteur.length) car.voltageSecteur = Math.max.apply(null, surSecteur);

  // ── Capacité : « 5 Ah », « 2.0Ah », « 12 Ah ». La plus grande annoncée.
  var ahs = [], ma, reA = /(\d+(?:[.,]\d+)?)\s*Ah\b/gi;
  while ((ma = reA.exec(t)) !== null) ahs.push(parseFloat(ma[1].replace(',', '.')));
  if (ahs.length) car.ah = Math.max.apply(null, ahs);

  /* ── Nombre de batteries. Trois écritures mesurées sur la page réelle :
       « 2 batteries », « 1X2.0Ah », « 2x 5,0 Ah ». Et « outil nu » vaut ZÉRO
       explicitement — ce n'est pas une absence d'information, c'est une
       information : la machine se vend sans batterie. */
  /* ⛔⛔ UN CHIFFRE COLLÉ À DES LETTRES APPARTIENT À UNE RÉFÉRENCE, PAS À UN
     COMPTE. Mesuré sur SON relevé du 03/08 : « 10 x DEWALT DCB184 batteries »
     rendait **184 batteries** — les trois chiffres de la réf DCB184. Le compte
     doit donc être précédé d'autre chose qu'une lettre ou un chiffre.
     ⚠️ Et le compte n'est pas toujours accolé au mot : « 2x Powerstack
     batterie » en sépare les deux par un nom de gamme — mesuré au même
     endroit, rendu « 1 batterie » au lieu de 2. On tolère jusqu'à deux mots
     entre le nombre et « batterie », jamais un chiffre. */
  var mb = bas.match(new RegExp('(?:^|[^' + LETTRE + '])(\\d+)\\s*[x×]?\\s*(?:[a-zà-öø-ÿ-]+\\s+){0,2}batterie'));
  if (mb) car.nbBatteries = parseInt(mb[1], 10);
  else if (/\bbatterie/.test(bas)) car.nbBatteries = 1;
  var mx = t.match(/\b(\d+)\s*[xX×]\s*\d+(?:[.,]\d+)?\s*Ah\b/);
  if (mx) car.nbBatteries = parseInt(mx[1], 10);
  // Toutes les écritures de « sans batterie » vivent dans la nomenclature.
  if (MACHINE_NUE_RE.test(bas)) car.nbBatteries = 0;

  /* Multiplicateur de tête : « 10 x DEWALT DCB184 … » annonce un LOT de dix
     articles. C'est un nombre de PIÈCES, pas une caractéristique de l'article. */
  var mmul = t.match(/^\s*(\d{1,4})\s*[x×]\s+/i);
  if (mmul && car.nbPieces == null) car.nbPieces = parseInt(mmul[1], 10);
  /* ⛔⛔ « 5 LAMES » DIT CINQ, MÊME SANS LE MOT « LOT ». Mesuré le 03/08 en
     éprouvant l'appariement souple : deux faux positifs, tous deux parce que
     « de 5 lames 30x43 mm » ressortait à UNE pièce — le décompte n'était lu
     que derrière « lot de N » ou « N x ». Un comparateur réordonne les mots ;
     exiger une tournure précise, c'est perdre l'information qui SÉPARE un lot
     de cinq d'une pièce à l'unité. Et cette information vaut cinq fois le prix.
     ⛔ VOCABULAIRE FERMÉ, pas un mot au pluriel quelconque : « 18 v batteries »
     ou « 30x43 mm lames » ne doivent pas se lire comme des décomptes de
     n'importe quoi. On ne compte que des pièces de quincaillerie nommées.
     ⚠️ Le nombre doit précéder IMMÉDIATEMENT le mot, et rester sous 999 : un
     nombre à quatre chiffres est une puissance ou une référence. */
  var PIECES_DENOMBRABLES = '(?:lames?|forets?|meches?|disques?|embouts?|douilles?'
    + '|cles?|pointes?|clous?|vis|fraises?|scies?|burins?|ciseaux|brosses?|tetes?)';
  var mPieces = bas.match(new RegExp('\\b(\\d{1,3})\\s+' + PIECES_DENOMBRABLES + '\\b'));
  if (mPieces && car.nbPieces == null) car.nbPieces = parseInt(mPieces[1], 10);
  /* Un LOT de N batteries contient N batteries — ce n'est pas une déduction
     hasardeuse, c'est la même information dite deux fois. Sans ça, « 10 x …
     batteries » ressortait à 1 après correction du 184, et un lot de dix se
     serait comparé à une batterie seule. */
  if (car.rayon === 'batterie' && car.nbPieces > 1
      && (car.nbBatteries == null || car.nbBatteries === 1)) {
    car.nbBatteries = car.nbPieces;
  }

  // ── Combo : « pack 3 outils », « 5 machines ». Même garde que ci-dessus.
  var mo = bas.match(new RegExp('(?:^|[^' + LETTRE + '])(\\d+)\\s*(?:outils|machines)\\b'));
  if (mo) car.nbOutils = parseInt(mo[1], 10);
  /* ⛔ « Pack 2 outils 18V (DHP458 + DTD154) » n'est typé par AUCUN mot du
     vocabulaire : c'est le NOMBRE qui le désigne. Mesuré — 11 fiches de son
     catalogue restaient sans type pour cette seule raison, et un combo sans
     type ne peut être distingué d'une machine seule au moment de comparer. */
  /* ⚠️ Le rayon aussi : « Pack 3 outils » sortait `machine / null / pack
     d'outils` là où les deux autres chemins vers ce même type disent `combo`.
     Un type juste avec un rayon vide se range mal, et se compare mal. */
  if (!car.type && car.nbOutils != null && car.nbOutils > 1) {
    car.famille = 'machine'; car.rayon = 'combo'; car.type = 'pack d\'outils';
  }
  /* ⛔⛔ UN KIT QUI ANNONCE SON NOMBRE D'OUTILS L'EMPORTE SUR LE NOM DES OUTILS
     QU'IL CONTIENT. Mesuré sur SA page du 03/08 : « - Kit 2 Outils Perceuse
     Visseuse et Perforateur SDS-Plus 18V 5AH - DCK22… » sortait
     `percage / perceuse-visseuse`. La règle ci-dessus ne s'applique qu'à
     défaut de type — or ici le type EST trouvé, puisque le titre nomme les
     deux outils du lot. Le parseur retenait donc le PREMIER contenu au lieu
     du contenant.
     ⚠️ J4 — c'est de l'argent : un lot de deux machines rapproché d'une fiche
     de perceuse seule compare deux choses différentes, et le coût d'achat
     d'un pack devient le coût d'une machine.
     ⛔ On exige les DEUX : un mot de lot ET un décompte supérieur à 1. Le mot
     seul ne suffit pas — « Kit DCS570 + DCS334 » est déjà traité plus bas par
     les deux références —, et le décompte seul non plus : « compatible avec 3
     outils » n'est pas un pack. */
  else if (car.nbOutils != null && car.nbOutils > 1 && MOT_LOT.test(bas)) {
    car.famille = 'machine'; car.rayon = 'combo'; car.type = 'pack d\'outils';
  }
  /* ⛔⛔ « ÉDITION LIMITÉE » N'EST PAS UN HABILLAGE, C'EST UN AUTRE ARTICLE.
     Règle donnée par l'user le 03/08 : « chez DeWALT il y a des outils en
     édition limitée et même des packs ; quand il y a écrit édition limitée,
     souvent — même 99,9 % du temps — c'est un pack McLaren, il faut faire très
     attention à ça car la différence de prix est notable ».
     ⛔ POURQUOI C'EST DE L'ARGENT. PORTE J4 LUE (`node scripts/juridique.js J4`) :
     le prix annoncé doit être exact et complet. Deux annonces peuvent porter la
     MÊME référence constructeur sans être le même produit — la série limitée se
     vend nettement plus cher que la version courante. Les rapprocher, c'est
     écrire un coût d'achat de série limitée sur une fiche ordinaire, donc
     afficher un prix qui ne correspond à rien ; ou l'inverse, et l'inverse fait
     vendre à perte. C'est la faute que la règle « un prix de PACK ne s'écrit
     jamais sur la réf d'un composant » interdit déjà ; l'édition limitée en
     était une variante que RIEN ne détectait.
     ⚠️ Ce marqueur ne FIXE aucun prix et n'annonce aucune réduction : il
     EMPÊCHE un rapprochement. Le prix de référence des 30 jours reste calculé
     ailleurs, sur le journal réel.
     ⚠️ ON MARQUE, ON NE DEVINE PAS. `editionLimitee` devient un champ BLOQUANT :
     deux annonces qui ne s'accordent pas dessus ne peuvent plus être déclarées
     compatibles. On ne touche ni au type ni à la famille — une meuleuse en
     série limitée reste une meuleuse.
     ⚠️ « McLaren » entre aussi dans le motif : c'est le nom que porte la série,
     et il arrive qu'il soit écrit sans la mention « édition limitée ». */
  /* ⛔ TOUJOURS UN BOOLÉEN, JAMAIS `undefined` QUAND C'EST FAUX. Un champ absent
     est une IGNORANCE et une ignorance NE VOTE PAS (règle du rapprochement) :
     laisser `undefined` sur la version courante aurait rendu la garde
     décorative — mesuré à l'écriture, `compatible: true` entre une série
     limitée et sa version ordinaire. Ici l'absence de mention EST une
     information : le titre décrit la version courante. */
  car.editionLimitee = EDITION_LIMITEE.test(bas);
  /* ⛔ DEUX RÉFÉRENCES DE MACHINE DANS UN TITRE = UN LOT DE MACHINES. Mesuré
     sur SON relevé du 03/08 : « Kit DeWALT DCS570 + DCS334 (2 x 5.0 Ah +
     DCB115 + TSTAK II) » sortait SANS TYPE — aucun mot du vocabulaire ne le
     nomme, et le préfixe DCS ne dit que « sciage ».
     ⚠️ La règle ne s'applique que si AUCUN type n'a été trouvé : « Vibrateur
     DCE531N-XJ + 1 chargeur DCB1104-QW » porte lui aussi deux références, mais
     c'est un vibrateur — son nom est écrit, et un nom écrit l'emporte toujours
     sur un comptage. */
  if (!car.type) {
    var refsTitre = Object.create(null);
    (t.match(/\b[A-Z][A-Z0-9]{2,}(?:[-\/.][A-Z0-9]+)*\b/g) || []).forEach(function (x) {
      var r = x.toUpperCase();
      if (!/\d/.test(r) || r.length < 5 || UNITE_RE.test(r)) return;
      // Les batteries et coffrets d'un lot ne comptent pas comme des machines.
      var pr = nomen.prefixeDeReference(r);
      if (pr && (pr.famille === 'energie' || pr.famille === 'rangement')) return;
      refsTitre[r.replace(/-(XJ|QW|QS|GB|LX|B1|QZ)$/i, '')] = 1;
    });
    if (Object.keys(refsTitre).length >= 2) {
      car.famille = 'machine'; car.rayon = 'combo'; car.type = 'pack d\'outils';
    }
  }

  car.chargeur = /\bchargeurs?\b|\bcharger\b/.test(bas);

  /* ── Coffret. Sa MARQUE compte (l'user facture le coffret à part), et le mot
     générique « coffret » précède souvent la marque dans le titre — « en
     coffret T-STAK ». Une alternance unique donnerait donc « COFFRET » pour un
     T-STAK : on cherche la marque D'ABORD, le générique seulement en repli. */
  var mc = bas.match(BOITES);
  if (mc) car.coffret = mc[1].replace(/[-\s]/g, '').toUpperCase();
  /* ⛔ « Coffret DE 29 forets » n'est pas « un article livré EN coffret » :
     c'est un LOT dont le coffret est l'emballage, déjà dit par
     `conditionnement`. Le marquer aussi en `coffret` ferait croire à un
     supplément de rangement facturable là où il n'y en a pas. */
  else if (car.conditionnement == null && /\b(coffret|mallette|malette|valise)\b/.test(bas)) {
    car.coffret = 'GENERIQUE';
  }

  car.brushless = /\bbrushless\b|sans\s+charbon/.test(bas) ? true : null;

  /* ⛔ UNE MESURE À ZÉRO EST UNE MESURE FAUSSE, PAS UNE MESURE. Aucun outil ne
     pèse 0 kg ni ne consomme 0 W ; un zéro vient toujours d'un motif qui a
     accroché la mauvaise portion du titre. Il vaut mieux ne rien annoncer.
     Vu sur SON relevé du 03/08 : un aspirateur ressorti à `watts: 0`. */
  function posit(v) { return (typeof v === 'number' && isFinite(v) && v > 0) ? v : null; }

  var mp = t.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (mp) car.poidsKg = posit(parseFloat(mp[1].replace(',', '.')));
  var mba = t.match(/(\d{2,4})\s*bars?\b/i);
  if (mba) car.bars = posit(parseInt(mba[1], 10));
  var mli = t.match(/(\d+(?:[.,]\d+)?)\s*[lL]\b/);
  if (mli) car.litres = posit(parseFloat(mli[1].replace(',', '.')));
  /* ⛔ LE SÉPARATEUR DE MILLIERS COUPE LA PUISSANCE EN DEUX. Mesuré sur son
     relevé : « SDS-Max 1 500 W » rendait **500 W** — le motif ne voyait que
     les trois derniers chiffres. Une machine annoncée trois fois moins
     puissante qu'elle ne l'est ne se compare plus à la bonne fiche. */
  var mw = t.match(/(\d{1,2}[\s  .]\d{3}|\d{3,5})\s*W\b/);
  if (mw) car.watts = posit(parseInt(mw[1].replace(/[\s  .]/g, ''), 10));

  /* ══ QUINCAILLERIE : LES MESURES QUI FONT LE PRIX ═══════════════════════
     Mot de l'user : « il y aura la taille, ou l'alésage des circulaires avec
     le diamètre ». Deux lames de scie circulaire de même diamètre mais
     d'alésage différent ne se montent pas sur la même machine — les apparier
     écrirait un coût sur la mauvaise fiche. */

  /* ⛔ Ø EXPLICITE SEULEMENT. Le premier jet prenait le premier « N mm »
     venu : sur « Lame 30x43 mm » il annonçait un diamètre de 30 mm, alors
     que 30×43 sont les DIMENSIONS d'une lame plate qui n'a pas de diamètre. */
  var mdia = t.match(/[ØØø⌀]\s*(\d+(?:[.,]\d+)?)/) || bas.match(/diam[èe]tre\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/);
  if (mdia) car.diametreMm = parseFloat(mdia[1].replace(',', '.'));

  // Alésage : le trou central. Écrit « alésage 30 mm » ou « 190x30 mm ».
  var mal = bas.match(/al[ée]sage\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/);
  if (mal) car.alesageMm = parseFloat(mal[1].replace(',', '.'));

  /* Dimensions : « 30x43 mm », « 6 x 57 x 93 mm ». On exige l'unité mm à la
     fin, faute de quoi « 2x5,0 Ah » (des batteries) serait pris pour des
     dimensions. Rendues telles quelles : ce sont des cotes, pas un nombre. */
  var mdim = t.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?\s*mm\b/i);
  if (mdim) car.dimensionsMm = mdim[0].replace(/\s+/g, '').replace(/mm$/i, '');

  /* ⛔ UNE COTE NUE NE DIT PAS CE QU'ELLE MESURE. « Meuleuse 125 mm » est un
     diamètre de disque, « Lame Alligator 430 mm » une longueur : le titre ne
     tranche pas, et deviner nommerait faux la moitié du temps. Elle part donc
     dans `cotesMm` — une mesure présente, de nature non dite. Le Ø explicite
     va dans `diametreMm`, les centimètres dans `longueurMm` (ils ne servent
     qu'aux longueurs : guides, chaînes, perches). */
  if (car.diametreMm == null && car.dimensionsMm == null) {
    var mlmm = t.match(/(\d{2,4})\s*mm\b/i);
    if (mlmm) car.cotesMm = parseInt(mlmm[1], 10);
  }
  var mcm = t.match(/(\d+(?:[.,]\d+)?)\s*cm\b/i);
  if (mcm) car.longueurMm = Math.round(parseFloat(mcm[1].replace(',', '.')) * 10);
  var mlg = bas.match(/longueur\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*mm\b/);
  if (mlg) car.longueurMm = Math.round(parseFloat(mlg[1].replace(',', '.')));
  var mlm = t.match(/(\d+(?:[.,]\d+)?)\s*m(?![a-z])/i);
  if (mlm) car.longueurM = parseFloat(mlm[1].replace(',', '.'));

  /* ⛔⛔ ARGENT — DÉFAUT VU DANS MA PROPRE SORTIE, 03/08. Le fil de
     débroussailleuse s'écrit « 2,5mm x 68,6m » : l'unité mm est AU MILIEU et
     l'unité m à la fin. Aucune règle ci-dessus n'accrochait cette forme, et la
     GROSSEUR DU FIL disparaissait — si bien que « 2mm x 68,6m » et
     « 2,5mm x 68,6m », deux bobines de prix différents, ressortaient
     rigoureusement identiques. C'est précisément le recoupement à l'aveugle
     que l'user refuse. */
  var mfil = t.match(/(\d+(?:[.,]\d+)?)\s*mm\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*m(?![a-z])/i);
  if (mfil) {
    car.diametreMm = parseFloat(mfil[1].replace(',', '.'));
    car.longueurM = parseFloat(mfil[2].replace(',', '.'));
  }

  var mpo = t.match(/(\d+\/\d+)\s*["″]/);
  if (mpo) car.pouces = mpo[1];
  var mdt = bas.match(/(\d{1,3})\s*dents?\b/);
  if (mdt) car.nbDents = parseInt(mdt[1], 10);
  var mgr = bas.match(/grain\s*(\d{1,4})\b/);
  if (mgr) car.grain = parseInt(mgr[1], 10);

  /* Ces quatre tables se lisent par correspondance la plus LONGUE, jamais par
     l'ordre : « sds-max » doit battre « sds », « torx plus » battre « torx »,
     « bois dur » battre « bois ». Un `break` au premier trouvé donnait la
     mauvaise réponse dès que l'écriture courte figurait avant la longue. */
  car.nuance = chercherTable(bas, NUANCES);
  car.emmanchement = chercherTable(bas, EMMANCHEMENTS);
  car.denture = chercherTable(bas, DENTURES);
  car.formeDisque = chercherTable(bas, FORMES_DISQUE);
  var mempr = t.match(/\b(PZ|PH|TX|T)\s?(\d{1,2})\b/i);
  if (mempr) car.empreinte = mempr[1].toUpperCase() + mempr[2];
  else car.empreinte = chercherTable(bas, EMPREINTES);
  for (var mt = 0; mt < MATIERES.length; mt++) {
    if (motEntier(bas, MATIERES[mt])) { car.matiere = MATIERES[mt]; break; }
  }

  /* ══ EPI ET VÊTEMENT DE TRAVAIL ════════════════════════════════════════
     ⚠️ Les codes de la norme chaussures ont CHANGÉ en 2022 (EN ISO 20345) :
     S6 et S7 sont apparus, et les suffixes S / L distinguent la plaque
     anti-perforation testée à la petite pointe (3 mm) de celle testée à la
     large (4,5 mm). Vérifié en ligne le 03/08/2026 avant d'écrire cette
     liste — de mémoire j'aurais rendu S1..S3 et rien d'autre, donc faux. */
  /* Deux écritures : le code de classe (S3S, FFP2…) et la norme numérotée
     (EN 388, EN ISO 20471). La seconde était lue comme une RÉFÉRENCE par
     l'extracteur de réf éclatée — « EN 388 » devenait le sku « EN388 ». */
  var mno = t.match(/\b(EN\s?ISO\s?\d{3,5}|EN\s?\d{3,5}|FFP[123]|S[1-7]P?[SL]?|SB|SR[ABC]|WRU?|HRO|HI|CI|ESD)\b/);
  if (mno) car.normeEpi = mno[1].replace(/\s+/g, ' ').toUpperCase();
  var mta = t.match(/\btaille\s*:?\s*(XXS|XS|S|M|L|XL|XXL|[2-5]XL)\b/i);
  if (mta) car.taille = mta[1].toUpperCase();

  /* ⛔ TROIS ÉCHELLES QUI NE SE MÉLANGENT PAS, ET LE MOT « TAILLE » LES DIT
     TOUTES LES TROIS. « taille 43 » est une pointure sur une chaussure,
     « taille 9 » une taille de gant, « taille 48 » une taille de pantalon.
     Le nombre seul ne tranche pas : 43 est plausible en pointure ET hors
     borne pour un gant, mais 12 est à la fois une taille de gant et rien du
     tout ailleurs. C'EST LE RAYON QUI DÉCIDE — l'entonnoir sert exactement
     à ça. Mesuré avant correction : « Pantalon de travail taille 48 » sortait
     avec `pointure: 48`, puis perdait tout au verrou. */
  var mnum = bas.match(/\b(pointure|taille)\s*:?\s*(\d{1,2})\b/);
  if (mnum) {
    var mot = mnum[1], vt = parseInt(mnum[2], 10);
    var dansPointure = vt >= nomen.POINTURES[0] && vt <= nomen.POINTURES[1];
    var dansGant = vt >= nomen.TAILLES_GANT[0] && vt <= nomen.TAILLES_GANT[1];
    var dansVet = vt >= nomen.TAILLES_VETEMENT_FR[0] && vt <= nomen.TAILLES_VETEMENT_FR[1];
    if (mot === 'pointure') { if (dansPointure) car.pointure = vt; }
    else if (car.rayon === 'chaussure') { if (dansPointure) car.pointure = vt; }
    else if (car.rayon === 'main') { if (dansGant) car.tailleGant = vt; }
    else if (car.rayon) { if (dansVet && !car.taille) car.taille = String(vt); }
    else {
      // Rayon inconnu : on ne choisit pas à sa place, on remplit ce qui est
      // possible et le verrou n'effacera rien faute de rayon.
      if (dansGant) car.tailleGant = vt;
      if (dansVet && !car.taille) car.taille = String(vt);
    }
  }

  /* ── Avec fil ou sur batterie : jamais deviné sans un mot explicite, sauf
     quand le titre annonce lui-même une batterie. « 230 V » seul suffit à dire
     filaire — mais pas s'il y a aussi un voltage de batterie (le chargeur). */
  if (/\bsans fil\b|\bsans-fil\b|\bcordless\b/.test(bas) || car.serie) car.sansFil = true;
  else if (car.nbBatteries != null && car.nbBatteries > 0) car.sansFil = true;
  // ⚠️ `\b` est ASCII : « \bélectrique » ne peut JAMAIS accrocher, « é » n'est
  //    pas un caractère de mot. La borne se met à droite seulement.
  else if (/\bfilaire\b|\bthermique\b|\bessence\b|[ée]lectrique\b/.test(bas)) car.sansFil = false;
  else if (car.voltageSecteur && car.voltage == null) car.sansFil = false;

  /* ── Lot. ⛔ RÈGLE D'ARGENT : ce drapeau dit « ce prix couvre PLUS que la
     machine seule ». Il n'est donc pas un pari sur le mot « pack » : toute
     batterie, tout chargeur, tout coffret, tout « + » le lève. `outil nu en
     coffret` reste un lot — son prix inclut la boîte. */
  car.pack = /\+/.test(t)
    || /\b(kit|pack|combo|set|lot de|ensemble)\b/.test(bas)
    || (car.nbBatteries != null && car.nbBatteries > 0)
    || car.chargeur === true
    || car.coffret != null
    || (car.nbOutils != null && car.nbOutils > 1)
    || (car.nbPieces != null && car.nbPieces > 1);

  /* ⛔⛔ SUR UNE PIÈCE DE QUINCAILLERIE, « PAS DE DÉCOMPTE ÉCRIT » VEUT DIRE UNE.
     Mesuré le 03/08 en éprouvant l'appariement souple sur ses 379 fiches sans
     référence : DEUX faux positifs, et les deux du même mécanisme —
     « Lot de 5 lames 30x43 mm pour multi-cutter Métal » apparié à
     « Lame 30x43 mm pour multi-cutter Métal ». Toutes les autres mesures
     concordaient (dimensions, matière, machine visée) ; seul le NOMBRE séparait
     les deux articles, et il valait `null` d'un côté.
     ⛔ Un champ absent est une IGNORANCE, et une ignorance NE VOTE PAS : le
     décompte ne pouvait donc rien contredire. C'est la troisième fois que ce
     mécanisme coûte — après `coffret` et `editionLimitee`. La règle est
     désormais générale : quand l'absence d'une mention a un SENS, on l'écrit.
     ⚠️ UNIQUEMENT sur les consommables et la quincaillerie, où l'unité est le
     défaut naturel, et seulement si le TYPE est connu — sinon on inventerait
     une caractéristique sur un texte qu'on n'a pas compris.
     ⚠️ Sens de l'erreur assumé (J4) : un lot dont le titre tait la quantité
     sera jugé incompatible et son prix ne sera PAS écrit. Un prix de lot de
     cinq lames sur une fiche de lame à l'unité diviserait le coût par cinq et
     ferait vendre à perte. On préfère ne rien écrire. */
  if ((car.famille === 'consommable' || car.famille === 'quincaillerie')
      && car.nbPieces == null && car.type) {
    car.nbPieces = 1;
  }

  /* ══ LE SUFFIXE DE RÉFÉRENCE, DERNIER MOT SUR LE CONTENU ═══════════════
     Table vérifiée le 03/08 sur support.dewalt.com (voir `nomenclature.js`).
     ⛔⛔ C'EST LA MESURE QUI RAPPORTE LE PLUS. « DCD805P2 » et « DCD805N »
     sont la MÊME machine — l'une avec deux batteries 5,0 Ah, l'autre nue —
     et un titre de comparateur n'écrit souvent QUE la référence. Sans cette
     lecture, les deux se ressemblent trait pour trait et le prix du lot
     s'écrit sur la machine nue : deux batteries perdues à chaque vente.
     Le suffixe ne parle QUE s'il ne contredit pas le texte : ce qui est
     écrit en toutes lettres l'emporte toujours sur un code. */
  var refPourSuffixe = car.sku;
  if (refPourSuffixe && /^DE\s?WALT$/i.test(String(brand || '').replace(/[\s-]/g, ''))) {
    var nu2 = refPourSuffixe.replace(/-(XJ|QW|QS|GB|LX|B1|QZ)$/i, '');
    /* ⚠️ Le code se lit en DEUX morceaux, pas comme un mot de dictionnaire :
       la LETTRE donne la capacité, le CHIFFRE donne le nombre. « P2 » = deux
       batteries de 5,0 Ah — mais « P3 » existe aussi, et une table fermée à
       1 et 2 le ratait : mesuré sur DCK368P3T, un lot de TROIS batteries lu
       comme s'il n'en portait aucune. */
    var msuf = nu2.match(/([CDELMPHTXY])([1-4])T?$/) || nu2.match(/(NT|N)$/);
    if (msuf) {
      var lettre = msuf[1].toUpperCase();
      var nb = msuf[2] ? parseInt(msuf[2], 10) : null;
      var dec = nomen.SUFFIXES_DEWALT[nb != null ? (lettre + '1') : lettre];
      if (dec) {
        if (car.nbBatteries == null) car.nbBatteries = (nb != null ? nb : dec.nbBatteries);
        if (car.ah == null && dec.ah != null) car.ah = dec.ah;
        if (car.coffret == null && dec.coffret) car.coffret = dec.coffret;
        // « …P3T » : le T final APRÈS le code batterie signale le TSTAK.
        if (car.coffret == null && /[1-4]T$/.test(nu2)) car.coffret = 'TSTAK';
        if (car.nbBatteries > 0) { car.pack = true; car.sansFil = true; }
      }
    }
  }

  /* ⛔⛔ SUR UNE MACHINE, « PAS DE COFFRET ÉCRIT » VEUT DIRE NUE.
     Règle de l'user, 03/08 : « il faut qu'on favorise les outils sans coffret,
     toujours ; celle que tu as choisie ne contient pas NT-XJ mais elle est en
     coffret aussi ». Mesuré le même jour sur `DCM200N` : idealo affiche trois
     variantes de 226,88 € à 348,99 €, et le traqueur a retenu 249,99 € — une
     variante à coffret rapprochée d'une fiche d'outil nu.
     ⛔ POURQUOI LE `null` NE SUFFISAIT PAS. Un champ absent est une IGNORANCE,
     et une ignorance NE VOTE PAS au rapprochement : l'annonce nue rendait
     `coffret: null`, donc elle ne pouvait rien contredire. Seul `pack` la
     sauvait par accident. C'est exactement la faute déjà payée sur
     `editionLimitee` — un marqueur qui ne dit rien quand c'est faux est
     décoratif.
     ⚠️ UNIQUEMENT SUR LES MACHINES : une lame ou un vêtement n'a pas de
     coffret, et l'affirmer inventerait une caractéristique.
     ⚠️ SENS DE L'ERREUR ASSUMÉ : si un marchand vend un outil en coffret sans
     l'écrire, l'annonce sera jugée incompatible et le prix ne sera PAS écrit.
     On préfère ne rien écrire à écrire faux — un prix de coffret sur une fiche
     nue gonfle le prix de vente d'un article qu'il n'a pas acheté (J4).
     ⚠️ J3 — aucune donnée personnelle. J5 — aucune TVA, aucun octroi de mer. */
  if (car.famille === 'machine' && car.coffret == null) car.coffret = 'AUCUN';

  /* ══ LE VERROU DE L'ENTONNOIR ══════════════════════════════════════════
     ⛔ DERNIÈRE ÉTAPE, ET LA PLUS IMPORTANTE. Tout ce qui précède cherche
     large ; ici on efface ce qui n'a aucun sens dans le rayon trouvé. Une
     chaussure n'a pas de voltage, une lame n'a pas d'ampères-heures, un
     pantalon n'a pas d'alésage. Sans ce verrou, une pointure 43 pouvait
     ressortir en « voltage 43 » — et deux articles se comparer sur une
     mesure qui n'existe pas.
     ⚠️ Rayon inconnu ⇒ on n'efface RIEN. Un trou de vocabulaire ne doit pas
     faire perdre des mesures justes ; il doit se voir, pas se punir. */
  if (car.rayon) {
    var cles = Object.keys(car);
    for (var c = 0; c < cles.length; c++) {
      var k = cles[c];
      if (!nomen.MESURES[k]) continue;                    // famille, rayon, type, sku…
      if (nomen.mesureAutorisee(car.rayon, k)) continue;
      car[k] = (k === 'chargeur') ? false : null;
    }
  }

  return car;
}

/* ══ ORDRE DE BALAYAGE ═══════════════════════════════════════════════════════
   Demande de l'user, 03/08 : « commencer à scanner toujours la DERNIÈRE page
   quand on lit dans un ordre décroissant, et la PREMIÈRE page en ordre
   croissant ».

   ⛔ CE QUE ÇA VEUT DIRE, ET POURQUOI IL A RAISON. Les deux cas énoncent la
   même règle : ON COMMENCE PAR LE BOUT LE MOINS CHER. Avec un tri décroissant,
   la page 1 porte les machines les plus chères — celles qu'il ne vend pas — et
   les siennes sont à la fin. Il l'avait déjà dit : « si on ne scanne que
   1 000 produits en ordre décroissant, on scannera les plus chers, donc c'est
   inutile. » Commencer par la fin met la partie UTILE en premier : si le
   balayage casse en route, ce qui est déjà relevé est ce qui sert.

   ⚠️ FONCTION PURE — elle ne lit rien, n'appelle personne : elle rend l'ordre
   des pages et leurs URL. La loi de pagination (page N → offset (N−1)×pas)
   vient de SES propres URL, vérifiée sur ses pages 4, 5 et 67 le 02/08
   (`docs/TRAQUEUR-URLS.md`).
   ⛔ LA PAGE 1 N'A PAS D'OFFSET dans le chemin : son URL est la forme courte.
   Une page 1 reconstruite avec « -0 » est une AUTRE URL, et rien ne garantit
   qu'elle réponde pareil — on ne la fabrique donc jamais. */
function planBalayage(opts) {
  opts = opts || {};
  var pages = Math.max(1, parseInt(opts.pages, 10) || 1);
  var pas = Math.max(1, parseInt(opts.pas, 10) || 15);
  var descendant = String(opts.ordre || 'desc').toLowerCase().indexOf('asc') !== 0;
  var patron = opts.patron || '';
  var patronPage1 = opts.patronPage1 || '';

  var ordre = [];
  for (var n = 1; n <= pages; n++) ordre.push(n);
  // Décroissant → on part de la DERNIÈRE page ; croissant → de la PREMIÈRE.
  if (descendant) ordre.reverse();

  return ordre.map(function (n) {
    var offset = (n - 1) * pas;
    var url = null;
    if (n === 1 && patronPage1) url = patronPage1;
    else if (patron) url = patron.replace('{offset}', String(offset));
    return { page: n, offset: offset, url: url };
  });
}
/* Le rang d'une page DANS LE PLAN — pour dire « tu en es à la 12ᵉ sur 67 »
   sans que l'user ait à compter. Rend -1 si la page n'appartient pas au plan. */
function rangDansPlan(plan, page) {
  for (var i = 0; i < plan.length; i++) if (plan[i].page === page) return i + 1;
  return -1;
}

/* ── COMPARAISON ─────────────────────────────────────────────────────────────
   ⛔ « Ne recoupe pas avec deux ou trois informations. » Deux annonces ne
   désignent le même article que si AUCUNE caractéristique connue des deux
   côtés ne les sépare. Un champ `null` d'un côté n'est pas une concordance :
   c'est une ignorance, et une ignorance ne vote pas.

   Rend { compatible, conflits, concordances }. `compatible:false` dès UN
   conflit — parce qu'un prix de lot écrit sur une machine nue est une perte
   sèche, et qu'on préfère ne rien écrire à écrire faux. */
var CHAMPS_BLOQUANTS = [
  'famille', 'rayon', 'type',
  // machines
  'voltage', 'nbBatteries', 'nbOutils', 'pack', 'sansFil', 'coffret', 'ah', 'serie', 'watts',
  /* ⛔ Une SÉRIE LIMITÉE et sa version courante portent la même référence
     constructeur et ne valent pas le même prix (règle de l'user, 03/08). Un
     champ bloquant les sépare ; sans lui, le coût de l'une s'écrivait sur
     l'autre — et dans un sens, ça fait vendre à perte. */
  'editionLimitee',
  /* quincaillerie — mot de l'user : « il y aura la taille, ou l'alésage des
     circulaires avec le diamètre ». Deux lames de même Ø et d'alésage
     différent ne montent pas sur la même machine. */
  'nbPieces', 'diametreMm', 'alesageMm', 'dimensionsMm', 'cotesMm', 'longueurMm', 'longueurM',
  'pouces', 'nbDents', 'denture', 'grain', 'nuance', 'matiere', 'emmanchement',
  'empreinte', 'formeDisque',
  // EPI — une pointure 42 et une 44 sont deux articles, jamais un seul
  'taille', 'pointure', 'tailleGant', 'normeEpi'
];

function comparerCaracteristiques(a, b) {
  var conflits = [], concordances = [];
  a = a || {}; b = b || {};

  // Une réf identique des deux côtés ne DISPENSE pas des autres contrôles :
  // les vendeurs collent la réf du composant sur l'annonce du lot.
  var refA = a.sku || a.skuEclate, refB = b.sku || b.skuEclate;
  if (refA && refB) (refA === refB ? concordances : conflits).push('reference');

  for (var i = 0; i < CHAMPS_BLOQUANTS.length; i++) {
    var c = CHAMPS_BLOQUANTS[i];
    var va = a[c], vb = b[c];
    if (va == null || vb == null) continue;       // ignorance : ne vote pas
    if (va === vb) { concordances.push(c); continue; }
    conflits.push(c);
  }
  return { compatible: conflits.length === 0, conflits: conflits, concordances: concordances };
}

/* ── DÉTECTION DE BLOCAGE DU COMPARATEUR (anti rate-limit, 08/08/2026) ───────
   Le comparateur (idealo) est derrière Cloudflare : à cadence trop haute il
   sert une page de challenge (« Just a moment… »), un 403/429, ou l'erreur
   1015. Ce n'est PAS une page produit — la parser donnerait 0 article. On la
   NOMME pour que la session s'arrête, n'écrive rien, et déclenche le backoff.

   ⛔ FONCTION PURE, faux positif = poison. Un vrai listing idealo (long, plein
   de tuiles produit) ne doit JAMAIS être pris pour un blocage — sinon le
   traqueur se gèle tout seul. Deux garde-fous :
     · le STATUT HTTP (si le Raccourci l'envoie) fait AUTORITÉ : 403/429/503 et
       les codes Cloudflare 1xxx = bloqué, sans regarder le contenu ;
     · côté CONTENU, on n'accepte QUE des marqueurs distinctifs d'interstitiel
       Cloudflare — jamais un mot générique (« cookies », « forbidden ») qui
       vivrait dans un bandeau de consentement ou un nom d'outil.
   Retourne une raison (string) si bloqué, sinon null. */
function detecterBlocage(rawText, httpStatus) {
  var st = Number(httpStatus);
  if (st === 403 || st === 429 || st === 503 || (st >= 1000 && st < 1100)) {
    return 'statut-http-' + st;
  }
  var t = String(rawText || '').slice(0, 8000); // les marqueurs sont en tête de page
  var MARQUEURS = [
    [/just a moment/i, 'cloudflare-just-a-moment'],
    [/cf-browser-verification|__cf_chl|cf_chl_opt|\/cdn-cgi\/challenge/i, 'cloudflare-challenge'],
    [/checking your browser before accessing/i, 'cloudflare-checking-browser'],
    [/ddos protection by cloudflare/i, 'cloudflare-ddos'],
    [/attention required[\s\S]{0,60}cloudflare/i, 'cloudflare-attention'],
    [/error code:\s*1\d{3}/i, 'cloudflare-error-1xxx'],
    [/\b(hcaptcha|recaptcha)\b/i, 'captcha']
  ];
  for (var i = 0; i < MARQUEURS.length; i++) {
    if (MARQUEURS[i][0].test(t)) return MARQUEURS[i][1];
  }
  return null;
}

module.exports = { parseCotebrico: parseCotebrico, parseClickoutil: parseClickoutil, parseIdealo: parseIdealo, parseAuto: parseAuto, parsePriceFR: parsePriceFR, stripHtml: stripHtml, pickCheapestSource: pickCheapestSource, choisirCoutSource: choisirCoutSource, raisonAucuneSource: raisonAucuneSource, enMillis: enMillis, SOURCE_FRESH_MS: SOURCE_FRESH_MS, SOURCES_ACTIVES: SOURCES_ACTIVES, sourceActive: sourceActive, RUPTURE_RE: RUPTURE_RE, diagnostiquerPage: diagnostiquerPage, estMaPropreReponse: estMaPropreReponse, detecterBlocage: detecterBlocage, titresAttendus: titresAttendus, compterTuiles: compterTuiles, empreintePage: empreintePage, racineRef: racineRef, racineModele: racineModele,
  varianteProduit: varianteProduit, roleCoffret: roleCoffret,
  signatureBatteries: signatureBatteries, estPourAutreMachine: estPourAutreMachine,
  sansAccentsTitre: sansAccentsTitre, refUniqueDuTitre: refUniqueDuTitre,
  lireReferenceDuTitre: lireReferenceDuTitre, candidatsAvecPosition: candidatsAvecPosition, apparierParNomSouple: apparierParNomSouple, apparierParRefRecollee: apparierParRefRecollee, apparierParConfiguration: apparierParConfiguration, CONCORDANCES_MIN: CONCORDANCES_MIN, annoncesManquantes: annoncesManquantes, extraireCaracteristiques: extraireCaracteristiques, comparerCaracteristiques: comparerCaracteristiques, planBalayage: planBalayage, rangDansPlan: rangDansPlan, OUTILS: OUTILS, SERIES: SERIES, nomenclature: nomen };
