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
  var bloc = [], seen = {}, titreOffre = null;
  for (var i = 0; i < lignes.length; i++) {
    var l = lignes[i];
    if (VENDU_PAR.test(l)) {
      titreOffre = (bloc.length ? bloc[bloc.length - 1] : null) || titreOffre;
    }
    if (FIN_PRODUIT.test(l) || FIN_OFFRE.test(l)) {
      traiter(bloc, FIN_OFFRE.test(l) || !!titreOffre);
      if (FIN_PRODUIT.test(l)) titreOffre = null;
      bloc = [];
      continue;
    }
    bloc.push(l);
    if (bloc.length > 40) bloc.shift();   // garde-fou : un bloc reste court
  }
  traiter(bloc, !!titreOffre);            // dernier bloc, sans ancre finale

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
      // Sans titre s\u00fbr, on ne liste RIEN : un titre faux est pire qu'un vide.
      if (titre && px != null && px > 0) {
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
      var pxx = null;
      for (var q = b.length - 1; q >= 0; q--) {
        var mq = b[q].match(/([\d\s   ]*\d,\d{2})\s*\u20ac/);
        if (mq) { pxx = parsePriceFR(mq[1]); break; }
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
    refsMarque: compter(new RegExp(escapeRe(brand) + '\\s+[A-Z0-9][A-Z0-9.\\/\\-]*[A-Z0-9]', 'gi')),
    prixAvecMot: compter(/Prix\s+[\d\s   ]+,\d{2}\s*\u20ac/g),
    prixVirgule: compter(/\d[\d\s   ]*,\d{2}\s*\u20ac/g),
    prixPoint: compter(/\d+\.\d{2}\s*\u20ac/g),
    extraits: []
  };
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
var OUTILS = [
  // Le nom propre de l'outil. Ordre important : le plus spécifique d'abord —
  // « scie circulaire » avant « scie », sinon le générique gagne toujours.
  'perceuse-visseuse', 'perceuse à percussion', 'perceuse d\'angle', 'perceuse',
  'visseuse à chocs', 'visseuse à choc', 'visseuse', 'boulonneuse',
  'clé à chocs', 'clé à choc', 'cliquet',
  'meuleuse d\'angle', 'meuleuse droite', 'meuleuse', 'disqueuse', 'tronçonneuse',
  'scie circulaire', 'scie plongeante', 'scie sabre', 'scie à onglet', 'scie sauteuse',
  'scie égoïne', 'scie à ruban', 'scie-cloche', 'scie',
  'marteau perforateur', 'marteau de démolition', 'marteau', 'perforateur', 'burineur',
  'cloueuse', 'cloueur', 'agrafeuse', 'riveteuse',
  'ponceuse', 'polisseuse', 'défonceuse', 'dégauchisseuse', 'raboteuse', 'fraiseuse',
  'aspirateur', 'souffleur', 'nettoyeur haute pression', 'nettoyeur',
  'compresseur', 'générateur', 'groupe électrogène', 'vibrateur',
  'débroussailleuse', 'taille-haie', 'coupe-bordure', 'tondeuse',
  'laser', 'télémètre', 'projecteur', 'lampe', 'radio',
  'chargeur', 'batterie', 'coffret', 'pack outillage', 'kit'
];

var SERIES = ['flexvolt', 'powerstack', 'xtreme', 'atomic', 'powerdetect', 'xr', 'lxt', 'cxt', 'xgt'];
var BOITES = /\b(t-?\s?stak|tough\s?system|makpac|systainer|l-?boxx|tanos)\b/;

/* ⛔ `\b` NE MARCHE PAS SUR DU FRANÇAIS : il est ASCII, donc « \bégoïne » ou
   « débroussailleuse\b » se comportent autrement qu'on croit dès qu'un accent
   touche la bordure. Et `indexOf` tout court est pire : il a trouvé « kit »
   dans « maKITa » et rendu le type « kit » pour toute machine de la marque.
   D'où cette borne explicite : ni lettre latine, ni chiffre, de chaque côté. */
var LETTRE = 'a-zà-öø-ÿ0-9';
function motEntier(basseCasse, mot) {
  return new RegExp('(?:^|[^' + LETTRE + '])' + escapeRe(mot) + '(?![' + LETTRE + '])')
    .test(basseCasse);
}

function extraireCaracteristiques(titre, brand) {
  var t = String(titre || '').replace(/[ \t   ]+/g, ' ');
  var bas = t.toLowerCase();
  var car = {
    sku: null, skuEclate: null, type: null, serie: null,
    voltage: null, voltageSecteur: null, ah: null,
    nbBatteries: null, nbOutils: null, chargeur: false, coffret: null,
    pack: false, sansFil: null, brushless: null,
    poidsKg: null, diametreMm: null, bars: null
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
    if (me) car.skuEclate = (me[1] + me[2] + (me[3] || '')).toUpperCase();
  }

  // ── Nom propre de l'outil : le premier de la liste qui apparaît, EN MOT
  //    ENTIER. `indexOf` seul trouvait « kit » dans « ma-KIT-a ».
  for (var o = 0; o < OUTILS.length; o++) {
    if (motEntier(bas, OUTILS[o])) { car.type = OUTILS[o]; break; }
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
  var mb = bas.match(/(\d+)\s*(?:x\s*)?batterie/);
  if (mb) car.nbBatteries = parseInt(mb[1], 10);
  else if (/\bbatterie/.test(bas)) car.nbBatteries = 1;
  var mx = t.match(/\b(\d+)\s*[xX×]\s*\d+(?:[.,]\d+)?\s*Ah\b/);
  if (mx) car.nbBatteries = parseInt(mx[1], 10);
  if (/\b(outil nu|machine nue|sans batterie|body only)\b/.test(bas)) car.nbBatteries = 0;

  // ── Combo : « pack 3 outils », « 5 machines ».
  var mo = bas.match(/(\d+)\s*(?:outils|machines)\b/);
  if (mo) car.nbOutils = parseInt(mo[1], 10);

  car.chargeur = /\bchargeurs?\b|\bcharger\b/.test(bas);

  /* ── Coffret. Sa MARQUE compte (l'user facture le coffret à part), et le mot
     générique « coffret » précède souvent la marque dans le titre — « en
     coffret T-STAK ». Une alternance unique donnerait donc « COFFRET » pour un
     T-STAK : on cherche la marque D'ABORD, le générique seulement en repli. */
  var mc = bas.match(BOITES);
  if (mc) car.coffret = mc[1].replace(/[-\s]/g, '').toUpperCase();
  else if (/\b(coffret|mallette|malette|valise)\b/.test(bas)) car.coffret = 'GENERIQUE';

  car.brushless = /\bbrushless\b|sans\s+charbon/.test(bas) ? true : null;

  // ── Poids, diamètre, pression : ils sont dans le sous-titre idealo.
  var mp = t.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (mp) car.poidsKg = parseFloat(mp[1].replace(',', '.'));
  var md = t.match(/(\d{2,4})\s*mm\b/i);
  if (md) car.diametreMm = parseInt(md[1], 10);
  var mba = t.match(/(\d{2,4})\s*bars?\b/i);
  if (mba) car.bars = parseInt(mba[1], 10);

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
    || (car.nbOutils != null && car.nbOutils > 1);

  return car;
}

/* ── COMPARAISON ─────────────────────────────────────────────────────────────
   ⛔ « Ne recoupe pas avec deux ou trois informations. » Deux annonces ne
   désignent le même article que si AUCUNE caractéristique connue des deux
   côtés ne les sépare. Un champ `null` d'un côté n'est pas une concordance :
   c'est une ignorance, et une ignorance ne vote pas.

   Rend { compatible, conflits, concordances }. `compatible:false` dès UN
   conflit — parce qu'un prix de lot écrit sur une machine nue est une perte
   sèche, et qu'on préfère ne rien écrire à écrire faux. */
var CHAMPS_BLOQUANTS = ['type', 'voltage', 'nbBatteries', 'nbOutils', 'pack', 'sansFil', 'coffret', 'ah', 'serie'];

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

module.exports = { parseCotebrico: parseCotebrico, parseClickoutil: parseClickoutil, parseIdealo: parseIdealo, parseAuto: parseAuto, parsePriceFR: parsePriceFR, stripHtml: stripHtml, pickCheapestSource: pickCheapestSource, choisirCoutSource: choisirCoutSource, enMillis: enMillis, SOURCE_FRESH_MS: SOURCE_FRESH_MS, RUPTURE_RE: RUPTURE_RE, diagnostiquerPage: diagnostiquerPage, extraireCaracteristiques: extraireCaracteristiques, comparerCaracteristiques: comparerCaracteristiques, OUTILS: OUTILS, SERIES: SERIES };
