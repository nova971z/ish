'use strict';
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
       .replace(/<style[\s\S]*?<\/style>/gi, ' ')
       .replace(/<[^>]+>/g, ' ');                 // toutes les balises
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
function parseIdealo(rawText, brand) {
  var out = [];
  var ecartes = [];
  if (!rawText) return { items: out, sansRef: ecartes };
  brand = (brand || 'DEWALT');
  var lignes = stripHtml(rawText).split(/\n+/).map(function (l) {
    return l.replace(/[ \t   ]+/g, ' ').trim();
  }).filter(Boolean);

  var FIN_PRODUIT = /^d[\u00e9e]tails\s+du\s+produit$/i;
  var FIN_OFFRE   = /^d[\u00e9e]tails\s+de\s+l[\u2019']?offre$/i;
  var VENDU_PAR   = /^vendu\s+par\s*:/i;
  // Titre : la marque, puis la r\u00e9f en PREMIER mot. Ce qui suit est ignor\u00e9.
  var titreRe = new RegExp('^' + escapeRe(brand) + '\\s+([A-Z0-9][A-Z0-9.\\/-]*[A-Z0-9])\\b', 'i');
  // Prix : \u00ab \u00e0 partir de X,XX \u20ac \u00bb OU un montant seul (cas \u00ab 1 offre \u00bb).
  var prixApartir = /\u00e0\s*partir\s*de\s*([\d\s   ]*\d,\d{2})\s*\u20ac/i;
  var prixSeul    = /^([\d\s   ]*\d,\d{2})\s*\u20ac$/;

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
  var bloc = [], seen = {}, titreOffre = null;
  for (var i = 0; i < lignes.length; i++) {
    var l = lignes[i];
    if (VENDU_PAR.test(l)) {
      titreOffre = (bloc.length ? bloc[bloc.length - 1] : null) || titreOffre;
      /* ⛔ « Vendu par : » désigne le titre juste au-dessus — donc TOUT ce qui
         précède ce titre appartient à la carte d'avant, et doit être traité
         comme telle. Mesuré le 03/08 sans les ancres : la carte qui précédait
         une offre marchande était avalée par l'offre et perdue (2 produits lus
         au lieu de 3). On coupe ici, le titre de l'offre restant seul. */
      if (bloc.length > 1) {
        traiter(bloc.slice(0, bloc.length - 1), false);
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
    if (bloc.length > 40) bloc.shift();   // garde-fou : un bloc reste court
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

  function traiter(b, estOffre) {
    if (!b.length) return;
    /* Une offre marchande se reconna\u00eet \u00e0 \u00ab Vendu par : \u00bb \u2014 et ses titres sont
       des lots. On la LISTE au lieu de la deviner. */
    if (estOffre || b.some(function (x) { return VENDU_PAR.test(x); })) {
      var titre = titreOffre || '';
      var px = null;
      for (var k = b.length - 1; k >= 0; k--) {
        var m = b[k].match(/([\d\s   ]*\d,\d{2})\s*\u20ac/);
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
        ecartes.push({ titre: titre, prix: px, car: extraireCaracteristiques(titre, brand) });
        titreOffre = null;
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
    if (!sku) {
      /* \u26d4\u26d4 ARGENT \u2014 LE PRIX SE LIT EN DESCENDANT DEPUIS LE TITRE, JAMAIS EN
         REMONTANT DEPUIS LA FIN DU BLOC. Trouv\u00e9 PAR LA PORTE le 03/08 : sans
         l'ancre de fin, le bloc d'une carte se prolonge jusqu'au bandeau
         \u00ab Produits favoris \u00bb de la page, et la recherche \u00e0 rebours ramenait le
         prix d'un T\u00c9L\u00c9PHONE (774,99 \u20ac) sur une scie. Un prix faux sur un titre
         juste est pire qu'une ligne absente. Le prix d'une carte SUIT son
         titre \u2014 on s'arr\u00eate au premier trouv\u00e9 apr\u00e8s lui. */
      var pxx = null;
      for (var q = 1; q < b.length; q++) {
        var ma2 = b[q].match(prixApartir);
        if (ma2) { pxx = parsePriceFR(ma2[1]); break; }
        var ms2 = b[q].match(prixSeul);
        if (ms2) { pxx = parsePriceFR(ms2[1]); break; }
      }
      if (b[0] && pxx != null && pxx > 0 && new RegExp(escapeRe(brand), 'i').test(b.join(' '))) {
        /* R\u00e9f \u00e9clat\u00e9e par des espaces (\u00ab DeWalt DCS 579 T2T \u00bb) : on ne devine
           toujours pas de `sku`, mais on QUALIFIE \u2014 c'est ce qui permettra de
           rapprocher l'annonce d'une fiche sans jamais \u00e9crire son prix. */
        var descEc = b.slice(0, Math.min(b.length, 4)).join(' ');
        ecartes.push({ titre: b[0], prix: pxx, car: extraireCaracteristiques(descEc, brand) });
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
    if (prix == null || !(prix > 0)) return;
    seen[sku] = true;
    /* \u26a0\ufe0f LE TITRE SEUL NE SUFFIT PAS. Mesur\u00e9 sur la page r\u00e9elle : idealo \u00e9crit
       \u00ab DeWalt DCS572P2 \u00bb sur une ligne et \u00ab Scie circulaire portative, 1
       batterie, 3,5 kg \u00bb sur la SUIVANTE. Le type d'outil, le nombre de
       batteries et le poids vivent tous dans ce sous-titre. Ne lire que la
       premi\u00e8re ligne, c'est jeter la moiti\u00e9 de ce que la page dit. On donne
       donc \u00e0 l'extracteur tout ce qui va du titre au prix. */
    var desc = b.slice(iTitre, iPrix < 0 ? b.length : iPrix).join(' ');
    out.push({
      sku: sku, price: prix, name: brand + ' ' + sku, promo: false, enStock: null,
      car: extraireCaracteristiques(desc, brand)
    });
  }

  return { items: out, sansRef: ecartes };
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
    return { format: 'aucun', items: [], packs: clic.packs, sansRef: clic.sansRef };
  }
  // Le plus fécond gagne — trois gabarits mutuellement exclusifs sur les
  // vraies pages (mesuré : idealo rend 0 chez les deux autres, et vice versa).
  if (idea.items.length > cote.length && idea.items.length > clic.items.length) {
    /* Les offres marchandes d'idealo (« Vendu par : ») sortent en `sansRef` :
       ce sont des LOTS, leur prix ne s'écrit sur aucune réf tant que l'user
       n'a pas créé la fiche et posé son `srcNom`. Listés, jamais devinés. */
    return { format: 'idealo', items: idea.items, packs: [], sansRef: idea.sansRef };
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

function choisirCoutSource(sources, nowMs, maxAgeMs) {
  if (!sources || typeof sources !== 'object') return null;
  if (!(Number(nowMs) > 0)) return null;   // un « maintenant » non numérique ne date rien
  var age = (typeof maxAgeMs === 'number' && maxAgeMs > 0) ? maxAgeMs : SOURCE_FRESH_MS;
  var best = null;
  Object.keys(sources).forEach(function (slug) {
    var e = sources[slug] || {};
    var ttc = Number(e.ttc);
    if (!(ttc > 0)) return;
    if (e.enStock === false) return;                    // en rupture : inachetable
    var at = enMillis(e.at);
    if (!(at > 0) || (nowMs - at) > age) return;        // périmée ou indatable
    if (!best || ttc < best.ttc) best = { ttc: ttc, source: slug };
  });
  return best;
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
  var elague = aTyper.replace(/\([^)]*\)/g, ' ').replace(/\s\+.*$/, ' ').trim();
  if (elague.length >= 8) aTyper = elague;
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
    if (!car.type) {
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
  if (!car.type && car.nbOutils != null && car.nbOutils > 1) {
    car.famille = 'machine'; car.type = 'pack d\'outils';
  }
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

module.exports = { parseCotebrico: parseCotebrico, parseClickoutil: parseClickoutil, parseIdealo: parseIdealo, parseAuto: parseAuto, parsePriceFR: parsePriceFR, stripHtml: stripHtml, pickCheapestSource: pickCheapestSource, choisirCoutSource: choisirCoutSource, enMillis: enMillis, SOURCE_FRESH_MS: SOURCE_FRESH_MS, RUPTURE_RE: RUPTURE_RE, diagnostiquerPage: diagnostiquerPage, extraireCaracteristiques: extraireCaracteristiques, comparerCaracteristiques: comparerCaracteristiques, planBalayage: planBalayage, rangDansPlan: rangDansPlan, OUTILS: OUTILS, SERIES: SERIES, nomenclature: nomen };
