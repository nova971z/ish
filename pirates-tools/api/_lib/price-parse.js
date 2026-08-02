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
    if (/\s\+\s/.test(titre)) { out.packs.push(titre.slice(0, 120)); continue; }
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
  if (!cote.length && !clic.items.length) {
    return { format: 'aucun', items: [], packs: clic.packs, sansRef: clic.sansRef };
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

module.exports = { parseCotebrico: parseCotebrico, parseClickoutil: parseClickoutil, parseAuto: parseAuto, parsePriceFR: parsePriceFR, stripHtml: stripHtml, pickCheapestSource: pickCheapestSource, choisirCoutSource: choisirCoutSource, enMillis: enMillis, SOURCE_FRESH_MS: SOURCE_FRESH_MS, RUPTURE_RE: RUPTURE_RE, diagnostiquerPage: diagnostiquerPage };
