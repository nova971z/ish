#!/usr/bin/env node
/* banc-composants.js — LE PRIX D'UNE PIÈCE DÉTACHÉE, LU DANS LES RELEVÉS.
   ─────────────────────────────────────────────────────────────────────────
   ⛔ POURQUOI CE BANC : le calculateur de pack (`api/_lib/reconstitution.js`)
   ne sait rien tout seul. Il demande « combien coûte UNE batterie 5 Ah en
   18 V ? » et REFUSE de conclure si personne ne répond. Ce banc construit la
   réponse à partir des seules offres réellement relevées chez le fournisseur.
   Une pièce absente de la table n'est pas une estimation : c'est un refus.

   ⛔⛔ TROIS DÉFAUTS DE MES PROPRES PREMIERS JETS, TOUS MESURÉS LE 13/08/2026 :

   ① Je sélectionnais par le champ de type du parseur (`typ === 'chargeur'`).
      Résultat : **0 chargeur** sur 5 300 tuiles — alors que 970 tuiles
      écrivent « chargeur » dans leur titre. Le parseur classe la plupart des
      chargeurs en `typ:'batterie'`. Sans conséquence pour lui ; mais la table
      sortait sans aucun chargeur, donc TOUT pack en contenant restait
      non-reconstituable, donc l'économie était perdue en silence.

   ② Je lisais le texte dans `titre`. Or, dans les tuiles `unknown` des
      archives, `titre` vaut **null** et le libellé vit dans `name` (mesuré sur
      `admin-10.json`). Je jetais donc la majorité des tuiles sans le dire.

   ③ Avec ces deux réparations, la table s'est remplie de FAUX composants, tous
      relevés à la main sur ses propres archives :
        · « Makita DKP180ZJ … without Battery and Charger » → 175,04 € comptés
          comme un CHARGEUR : c'est un rabot, et la phrase dit que le chargeur
          est ABSENT. Ma détection de négation ne parlait que français.
        · « Makita DTM51RT1J3 (1 x 5,0 Ah Batterie, 41 pièces, Makpac) » →
          354,05 € comptés comme une BATTERIE 5 Ah : c'est un multi-outil.
        · « Batterie AKKU POWER RB3019 **pour** DEWALT 14.4V » → une batterie
          d'un TIERS, sur une autre plateforme.
        · « Batterie DeWALT XR 18V/20V/60V **2Ah 5Ah 6Ah 9Ah** » → une annonce
          à variantes : aucune capacité n'est celle du prix affiché.
        · « DEWALT Chargeur Mural USB-C GaN 100W », « Chargeur véhicule
          électrique Type 2 » → des chargeurs, oui, mais pas d'outil.
      Chacun de ces prix, injecté dans une soustraction, aurait fabriqué un
      coût de machine faux — dans le sens qui fait vendre à perte.

   ⇒ D'OÙ LA LIGNE DE CONDUITE, ET ELLE NE SE NÉGOCIE PAS : **une carte n'entre
   dans la table que si son titre ne peut rien vouloir dire d'autre.** Au
   moindre doute, on n'entre pas — et le calculateur refuse, ce qui coûte une
   économie manquée, jamais une vente à perte (sens sûr, M-11).

   ⚠️ Ce banc ne DÉCIDE rien et n'écrit dans aucun service : il lit des
   archives de relevé et rend un tableau.

   Usage :
     node scripts/banc-composants.js <dossier-de-releves> [autre-dossier ...]
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

/* ── LIRE TOUTES LES TUILES D'UNE ARBORESCENCE D'ARCHIVES ─────────────────── */
function tuilesDe(racine) {
  var out = [];
  if (!fs.existsSync(racine)) return out;
  (function walk(p) {
    var entrees;
    try { entrees = fs.readdirSync(p, { withFileTypes: true }); } catch (e) { return; }
    entrees.forEach(function (e) {
      var f = path.join(p, e.name);
      if (e.isDirectory()) return walk(f);
      if (!/\.json$/i.test(e.name)) return;
      var j;
      try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return; }
      (function scan(o) {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) return o.forEach(scan);
        /* Une TUILE = une offre du fournisseur : un libellé et un prix.
           ⚠️ Deux formes coexistent dans les archives, et elles ne rangent le
           libellé ni le prix au même endroit (défaut ② ci-dessus) :
             · `unknown[]`  → prix dans `srcTTC`, libellé souvent dans `name` ;
             · `sansRef[]`  → prix dans `prix`,   libellé dans `titre`. */
        if ('rej' in o && (typeof o.titre === 'string' || typeof o.name === 'string')) {
          var prix = Number(o.srcTTC != null ? o.srcTTC : o.prix);
          var texte = String(o.titre || o.name || '');
          if (prix > 0 && texte.trim()) {
            out.push({ texte: texte, descr: String(o.descr || ''), prix: prix,
              typ: o.typ || null, fam: o.fam || null, sku: o.sku || null,
              rej: o.rej == null ? null : String(o.rej), source: path.basename(f) });
          }
        }
        Object.keys(o).forEach(function (k) { scan(o[k]); });
      })(j);
    });
  })(racine);
  return out;
}

/* ── DE QUELLE MARQUE PARLE CE LIBELLÉ ? ───────────────────────────────────
   ⚠️ Une batterie DEWALT ne remplace pas une batterie MAKITA : mélanger les
   marques fabriquerait un coût qui n'existe pas. Marque indéterminée ⇒ écartée,
   jamais rattachée « à la plus probable ».
   ⛔ Un harnais ne nomme jamais une donnée du catalogue : les marques sont
   LUES dans les plans du traqueur (clefs « MARQUE@source »), pas écrites ici. */
function marquesConnues() {
  var m = [];
  try {
    var plans = require(path.join(__dirname, '..', 'api/_lib/traqueur-plans.js'));
    var src = plans && (plans.PLANS || plans.plans || plans);
    Object.keys(src || {}).forEach(function (k) {
      var mq = String(k).split('@')[0].trim().toUpperCase();
      if (/^[A-Z][A-Z0-9 -]{2,}$/.test(mq) && m.indexOf(mq) < 0) m.push(mq);
    });
  } catch (e) { /* plans illisibles : le préalable du bas le fera échouer */ }
  return m;
}

function marqueDuTexte(texte, marques) {
  var T = String(texte || '').toUpperCase();
  var vues = marques.filter(function (mq) { return T.indexOf(mq) >= 0; });
  return vues.length === 1 ? vues[0] : null;
}

/* ── LES CINQ REFUS, CHACUN PAYÉ PAR UNE CARTE RÉELLE ──────────────────────

   ① LA NÉGATION. « sans batterie ni chargeur », « without Battery and
   Charger », « ohne Akku und Ladegerät » : le titre parle de la pièce POUR
   DIRE QU'ELLE N'Y EST PAS. La compter comme une pièce vendue seule fait
   entrer un prix de MACHINE dans la table. */
function estNegation(t) {
  return /\bsans\s+(?:batteries?\s+(?:ni|et|\+)\s+)?(?:chargeurs?|batteries?)\b/i.test(t)
    || /\bni\s+(?:chargeurs?|batteries?)\b/i.test(t)
    || /\bhors\s+(?:chargeurs?|batteries?)\b/i.test(t)
    || /\b(?:chargeurs?|batteries?)\s+non\s+(?:inclus|fourni)/i.test(t)
    /* ⚠️ Défaut ③ : ma détection ne parlait que français. Les relevés sont
       remplis de libellés anglais et allemands — le comparateur agrège des
       vendeurs de toute l'Europe. */
    || /\bwithout\s+(?:a\s+)?(?:batter(?:y|ies)|charger)/i.test(t)
    || /\bno\s+(?:batter(?:y|ies)|charger)\b/i.test(t)
    || /\b(?:batter(?:y|ies)|charger)\s+not\s+included\b/i.test(t)
    || /\bbare\s*[- ]?\s*tool\b/i.test(t)
    || /\bohne\s+(?:akkus?|ladeger[äa]t)/i.test(t)
    || /\bsolo\b/i.test(t);
}

/* ② LA PIÈCE D'UN TIERS. « pour DEWALT », « compatible », « de
   remplacement » : elle n'est pas de la marque, et rien ne dit qu'elle tient
   la même charge. Un coût bâti dessus n'est pas celui qu'on paierait. */
/* ⛔ Les marques arrivent en ARGUMENT. Mon premier jet les écrivait EN DUR
   dans l'expression : un harnais ne nomme jamais une donnée du catalogue, et
   une liste en dur devient muette le jour où l'user ajoute une marque. */
function estPieceDeTiers(t, marques) {
  var noms = (marques || []).map(function (m) { return m.replace(/[^A-Za-z0-9]/g, '.'); }).join('|');
  if (noms && new RegExp('\\b(?:pour|for|f[üu]r)\\s+(?:outils?\\s+|tools?\\s+)?(?:' + noms + ')', 'i').test(t)) return true;
  return /\bcompatible/i.test(t)
    || /\bde\s+remplacement\b|\breplacement\b|\bersatz/i.test(t)
    /* « type DCB142 » : le vendeur dit que sa pièce IMITE ce modèle-là. */
    || /\btype\s+[A-Z]{2,3}\s?\d{3,}/i.test(t);
}

/* ③ L'ANNONCE À VARIANTES. « 18V/20V/60V 2Ah 5Ah 6Ah 9Ah » : le vendeur liste
   ce qu'il propose, et le prix affiché ne dit pas LAQUELLE. Retenir une de ces
   valeurs, c'est tirer au sort le coût d'un composant. */
function valeursAh(t) {
  var out = [], m, re = /(\d+(?:[.,]\d+)?)\s*Ah\b/gi;
  while ((m = re.exec(t)) !== null) {
    var v = parseFloat(m[1].replace(',', '.'));
    if (out.indexOf(v) < 0) out.push(v);
  }
  return out;
}
function valeursVolt(t) {
  var out = [], m, re = /(\d{1,2})\s*[vV]\b/g;
  while ((m = re.exec(t)) !== null) {
    var v = parseInt(m[1], 10);
    if (v >= 10 && out.indexOf(v) < 0) out.push(v);
  }
  /* ⚠️ « Batterie 18/54V » : une seule lettre V pour DEUX tensions. Sans cette
     lecture, une batterie FlexVolt bi-tension passait pour une simple 54 V —
     alors qu'elle n'appartient à aucune des deux plateformes seules. */
  var m2, re2 = /(\d{1,2})\s*\/\s*(\d{1,2})\s*[vV]\b/g;
  while ((m2 = re2.exec(t)) !== null) {
    [parseInt(m2[1], 10), parseInt(m2[2], 10)].forEach(function (v) {
      if (v >= 10 && out.indexOf(v) < 0) out.push(v);
    });
  }
  return out;
}

/* ④ LE PACK DÉGUISÉ. Un contenu entre parenthèses — « (1 x 5,0 Ah Batterie,
   41 pièces, Makpac) » — décrit ce qu'il y a DANS le produit : le produit,
   lui, est la machine qui précède. */
function annonceUnContenu(t) {
  return /\(\s*\d{1,2}\s*[xX×]\s*\d/.test(t)
    || /\d{1,2}\s*[xX×]\s*\d+(?:[.,]\d+)?\s*Ah/.test(t)
    /* ⚠️ « 3x batterie Powerstack 18 V 1,7 Ah » : le multiplicateur porte sur
       le MOT, pas sur un chiffre. Mon premier jet n'attrapait que « 3 x 1,7 Ah »
       et retenait donc un kit de trois batteries à 210,53 € comme le prix
       d'UNE batterie 1,7 Ah — trois fois trop cher, et dans le sens qui fait
       refuser des reconstitutions gagnantes. */
    || /\d{1,2}\s*[xX×]\s*(?:batteries?|akkus?|batter(?:y|ies))\b/i.test(t)
    || /\b(?:lots?|packs?|sets?|kits?)\s+(?:de\s+)?\d{1,2}\b/i.test(t)
    /* ⚠️ « Kit de démarrage de batterie DCB115M2-QW » (chargeur + 2 batteries)
       et « Power Source Kit 40V » : le mot KIT suffit, sans aucun chiffre. */
    || /\b(?:kits?|lots?|sets?|bundles?|starter|d[ée]marrage|source\s+kit)\b/i.test(t)
    || /\b(\d{1,2})\s*(?:batteries|akkus|pi[èe]ces|pcs)\b/i.test(t)
    || /\bmakpac\b|\btstak\b|\bcoffret\b|\bmallette\b/i.test(t);
}

/* ⑥ L'ANNONCE À RÉFÉRENCES MULTIPLES. « … 2,0 Ah, DCB125, DCB127, DCB120 » :
   le vendeur énumère les modèles couverts. Le prix affiché n'est celui
   d'aucun d'eux en particulier.
   ⚠️ Deux références ne suffisent pas à condamner : beaucoup de titres
   légitimes rappellent la référence entre parenthèses. À partir de TROIS, ce
   n'est plus un rappel, c'est un catalogue. */
function referencesDistinctes(t) {
  var vues = [], m, re = /\b[A-Z]{2,4}\s?\d{3,4}[A-Z]{0,3}\b/g;
  while ((m = re.exec(String(t).toUpperCase())) !== null) {
    var r = m[0].replace(/\s/g, '');
    if (vues.indexOf(r) < 0) vues.push(r);
  }
  return vues;
}

/* ⑤ LE CHARGEUR QUI NE CHARGE PAS D'OUTIL. Téléphone, USB, véhicule
   électrique : le mot est le même, l'objet n'a rien à voir. On ne les liste
   pas un par un — on exige au contraire la PREUVE que c'en est un : le titre
   doit porter la tension de la plateforme (« 18 V »). */

/* ── EST-CE UNE CARTE DE CHARGEUR D'OUTIL VENDU SEUL ? ─────────────────────
   ⚠️ Pour un chargeur, plusieurs tensions ne sont PAS une variante : un même
   chargeur couvre légitimement « 12 V - 18 V ». On exige donc que la tension
   de la plateforme figure PARMI celles annoncées, pas qu'elle soit unique. */
function chargeurSeul(c, marques) {
  var t = c.texte + ' ' + c.descr;
  if (!/\bchargeurs?\b|\bchargers?\b|\bladeger[äa]t/i.test(c.texte)) return null;
  if (estNegation(t)) return null;
  if (estPieceDeTiers(t, marques)) return null;
  if (String(c.fam || '').toLowerCase() !== 'energie') return null;
  if (valeursAh(c.texte).length) return null;      /* il y a une batterie dedans */
  if (/\bbatteries?\b|\bakkus?\b|\bbatter(?:y|ies)\b/i.test(c.texte)) return null;
  if (annonceUnContenu(c.texte)) return null;
  var volts = valeursVolt(c.texte);
  if (!volts.length) return null;                  /* refus ⑤ : rien ne prouve
                                                      que c'est un chargeur
                                                      d'outil */
  return { volts: volts };
}

/* ── EST-CE UNE CARTE DE BATTERIE UNITAIRE ? ───────────────────────────────
   UNE batterie, UNE capacité, UNE tension, aucun chargeur, aucune machine.
   C'est le seul cas où le prix affiché EST le prix d'une batterie. */
function batterieUnitaire(c, marques) {
  var t = c.texte + ' ' + c.descr;
  if (!/\bbatteries?\b|\bakkus?\b|\bbatter(?:y|ies)\b/i.test(c.texte)) return null;
  if (String(c.fam || '').toLowerCase() !== 'energie') return null;
  if (String(c.typ || '').toLowerCase() !== 'batterie') return null;
  if (estNegation(t)) return null;
  if (estPieceDeTiers(t, marques)) return null;
  if (annonceUnContenu(c.texte)) return null;
  if (referencesDistinctes(c.texte).length >= 3) return null;   /* refus ⑥ */
  if (/\bchargeurs?\b|\bchargers?\b|\bladeger[äa]t/i.test(c.texte)) return null;
  var ah = valeursAh(c.texte);
  if (ah.length !== 1) return null;                /* refus ③ */
  var volts = valeursVolt(c.texte);
  if (volts.length !== 1) return null;             /* refus ③, et FlexVolt
                                                      « 18/54 V » n'est pas la
                                                      plateforme 18 V */
  return { ah: ah[0], volt: volts[0], quantite: 1 };
}

/* ── LE LOT DE N BATTERIES IDENTIQUES : LA VRAIE ÉCONOMIE ──────────────────
   ⛔⛔ C'EST LE POINT QUE L'USER A SOULEVÉ, ET QUE MON BANC RATAIT. Mesuré sur
   ses trois relevés du 13/08/2026, pour une batterie 18 V 5,0 Ah :
     · meilleure carte UNITAIRE ........................ 99,57 €
     · « Lot de batteries 5 x DCB184 » à 323,94 € ...... 64,79 € l'unité
     · « Lot de batteries 10 x DCB184 » à 638,45 € ..... **63,85 € l'unité**
   En ne lisant que les cartes unitaires, la table annonçait 99,57 € : **35,72 €
   de trop par batterie, 36 % au-dessus du coût réellement atteignable.** Un
   coût trop haut ne fait pas vendre à perte — il fait perdre des ventes, et il
   fait REFUSER des reconstitutions qui étaient gagnantes.

   ⛔ DIVISER RESTE INTERDIT SAUF SI LE PRODUIT **EST** L'ARTICLE COMPTÉ (la
   leçon du 13/08, M-49). Ici : famille énergie, type batterie, aucun chargeur,
   aucune machine, une seule capacité, une seule tension, et un compte explicite
   de N ≥ 2 exemplaires. Si deux comptes se contredisent dans le même titre,
   c'est un REFUS : on ne choisit pas au hasard le diviseur d'un prix.

   ⚠️ ET ON NE CACHE PAS LE PRIX D'ENTRÉE : le coût unitaire d'un lot de 10 ne
   s'obtient qu'en achetant 10. La quantité minimale voyage avec le prix, pour
   que la décision d'achat se prenne en connaissance de cause. */
function comptesAnnonces(t) {
  var n = [], m;
  var res = [
    /(\d{1,2})\s*[xX×]\s*(?:batteries?|akkus?|batter(?:y|ies))\b/gi,
    /(\d{1,2})\s*[xX×]\s*\d+(?:[.,]\d+)?\s*Ah/gi,
    /\b(?:lots?|packs?|sets?|kits?)\s+(?:de\s+)?(\d{1,2})\b/gi,
    /\b(\d{1,2})\s*(?:batteries|akkus|batteries)\b/gi
  ];
  res.forEach(function (re) {
    while ((m = re.exec(t)) !== null) {
      var v = parseInt(m[1], 10);
      if (v >= 1 && v <= 20 && n.indexOf(v) < 0) n.push(v);
    }
  });
  return n;
}

function lotDeBatteries(c, marques) {
  var t = c.texte + ' ' + c.descr;
  if (!/\bbatteries?\b|\bakkus?\b|\bbatter(?:y|ies)\b/i.test(c.texte)) return null;
  if (String(c.fam || '').toLowerCase() !== 'energie') return null;
  if (String(c.typ || '').toLowerCase() !== 'batterie') return null;
  if (estNegation(t)) return null;
  if (estPieceDeTiers(t, marques)) return null;
  if (referencesDistinctes(c.texte).length >= 3) return null;
  /* ⛔ UN CHARGEUR DANS LE LOT REND LA DIVISION FAUSSE : son prix se
     répartirait sur chaque batterie et gonflerait le coût unitaire. */
  if (/\bchargeurs?\b|\bchargers?\b|\bladeger[äa]t/i.test(t)) return null;
  /* ⛔ Un coffret aussi : il est dans le prix et n'est pas une batterie. */
  if (/\bmakpac\b|\btstak\b|\bcoffret\b|\bmallette\b|\bcase\b/i.test(c.texte)) return null;
  /* ⛔ UN « + » JOINT AUTRE CHOSE, ET CETTE AUTRE CHOSE EST DANS LE PRIX.
     Mesuré sur ses relevés : « Power Source Kit 40V DC40RA **+**BL4040
     (2x Battery 4 Ah) » à 378,98 € sortait à 189,49 € « l'unité » — sauf que
     DC40RA est un chargeur, jamais nommé « chargeur » dans le titre. Son prix
     se répartissait sur les deux batteries : un coût unitaire faux, trop HAUT,
     qui fait renoncer à des reconstitutions pourtant gagnantes. */
  if (/\+/.test(c.texte)) return null;
  var ah = valeursAh(c.texte);
  if (ah.length !== 1) return null;
  var volts = valeursVolt(c.texte);
  if (volts.length !== 1) return null;
  var n = comptesAnnonces(c.texte);
  if (n.length !== 1) return null;   /* ⛔ comptes absents ou contradictoires */
  if (!(n[0] >= 2)) return null;     /* un seul exemplaire : ce n'est pas un lot */
  return { ah: ah[0], volt: volts[0], quantite: n[0] };
}

/* ── CONSTRUIRE LA TABLE ────────────────────────────────────────────────────
   On retient le prix le PLUS BAS par (marque, tension, capacité) : c'est celui
   qu'on paierait réellement en achetant la pièce seule. */
function construire(tuiles) {
  var marques = marquesConnues();
  var batteries = {}, chargeurs = {};
  var refus = {};
  function noteRefus(k) { refus[k] = (refus[k] || 0) + 1; }

  tuiles.forEach(function (c) {
    var estMotChargeur = /\bchargeurs?\b|\bchargers?\b|\bladeger[äa]t/i.test(c.texte);
    var estMotBatterie = /\bbatteries?\b|\bakkus?\b|\bbatter(?:y|ies)\b/i.test(c.texte);
    if (!estMotChargeur && !estMotBatterie) return;

    var mq = marqueDuTexte(c.texte, marques);
    /* ⚠️ Une carte unitaire OU un lot du même article donnent tous deux un coût
       unitaire. On compare les deux et on garde le plus bas — c'est la demande
       de l'user : « le parseur doit chercher à créer les meilleurs prix ». */
    var lu = batterieUnitaire(c, marques) || lotDeBatteries(c, marques);
    if (lu) {
      if (!mq) return noteRefus('batterie sans marque unique');
      var kb = mq + '|' + lu.volt + 'V|' + lu.ah + 'Ah';
      var unitaire = Math.round((c.prix / lu.quantite) * 100) / 100;
      if (!batteries[kb] || unitaire < batteries[kb].prix) {
        batteries[kb] = { prix: unitaire, quantiteMinimale: lu.quantite,
          prixDuLot: c.prix, texte: c.texte, source: c.source };
      }
      return;
    }
    var lc = chargeurSeul(c, marques);
    if (lc) {
      if (!mq) return noteRefus('chargeur sans marque unique');
      lc.volts.forEach(function (v) {
        var kc = mq + '|' + v + 'V';
        if (!chargeurs[kc] || c.prix < chargeurs[kc].prix) {
          chargeurs[kc] = { prix: c.prix, quantiteMinimale: 1,
            prixDuLot: c.prix, texte: c.texte, source: c.source };
        }
      });
      return;
    }
    /* ⛔ AUCUN REFUS SILENCIEUX : on dit combien de cartes on a écartées et
       pourquoi. Une table qui se tait passe pour exhaustive. */
    var tt = c.texte + ' ' + c.descr;
    if (estNegation(tt)) noteRefus('negation : la piece est dite ABSENTE');
    else if (estPieceDeTiers(tt, marques)) noteRefus('piece d\'un tiers ou compatible');
    else if (annonceUnContenu(c.texte)) noteRefus('contenu multiple : c\'est un pack');
    else if (String(c.fam || '').toLowerCase() !== 'energie') noteRefus('famille non energie');
    else if (estMotBatterie && valeursAh(c.texte).length !== 1) noteRefus('capacite absente ou multiple (annonce a variantes)');
    else if (estMotBatterie && valeursVolt(c.texte).length !== 1) noteRefus('tension absente ou multiple');
    else if (estMotChargeur && !valeursVolt(c.texte).length) noteRefus('chargeur sans tension : rien ne prouve que c\'est un chargeur d\'outil');
    else if (referencesDistinctes(c.texte).length >= 3) noteRefus('trois references ou plus : annonce a variantes');
    else noteRefus('autre');
  });
  return { batteries: batteries, chargeurs: chargeurs, refus: refus, marques: marques };
}

/* ── LA FONCTION QUE LE CALCULATEUR APPELLE ────────────────────────────────
   `prix({quoi, ah})` pour un produit d'une marque et d'une tension données.
   ⛔ Elle rend `null` — jamais une approximation — dès que la pièce exacte
   n'est pas dans la table. C'est ce refus qui protège l'argent. */
function fonctionPrix(table, marque, volt) {
  return function (q) {
    if (!marque || !volt) return null;
    if (q.quoi === 'chargeur') {
      var c = table.chargeurs[marque + '|' + volt + 'V'];
      return c ? c.prix : null;
    }
    if (String(q.quoi).indexOf('batterie') === 0) {
      if (!(q.ah > 0)) return null;   /* capacité inconnue ⇒ refus, pas de « au hasard » */
      var b = table.batteries[marque + '|' + volt + 'V|' + q.ah + 'Ah'];
      return b ? b.prix : null;
    }
    return null;
  };
}

module.exports = {
  tuilesDe: tuilesDe, construire: construire, fonctionPrix: fonctionPrix,
  marquesConnues: marquesConnues, marqueDuTexte: marqueDuTexte,
  batterieUnitaire: batterieUnitaire, lotDeBatteries: lotDeBatteries,
  chargeurSeul: chargeurSeul, comptesAnnonces: comptesAnnonces,
  estNegation: estNegation, estPieceDeTiers: estPieceDeTiers,
  annonceUnContenu: annonceUnContenu, valeursAh: valeursAh, valeursVolt: valeursVolt,
  referencesDistinctes: referencesDistinctes
};

if (require.main === module) {
  var racines = process.argv.slice(2);
  if (!racines.length) {
    console.error('usage: node scripts/banc-composants.js <dossier-de-releves> [...]');
    process.exit(2);
  }
  var toutes = [];
  racines.forEach(function (r) { toutes = toutes.concat(tuilesDe(r)); });
  /* ⛔ PRÉALABLE : sans tuile, le banc n'a rien vérifié. Non exécuté n'est pas vert. */
  if (!toutes.length) {
    console.error('⛔ PRÉALABLE : aucune tuile lue dans ' + racines.join(', '));
    process.exit(2);
  }
  var T = construire(toutes);
  /* ⛔ PRÉALABLE : sans liste de marques, TOUTE carte est écartée et la table
     sort vide en ayant l'air d'avoir travaillé — c'est exactement ce qui s'est
     produit au premier lancement (0 marque lue, 0 carte retenue). */
  if (!T.marques.length) {
    console.error('⛔ PRÉALABLE : aucune marque lue dans les plans du traqueur.');
    process.exit(2);
  }
  console.log(toutes.length + ' tuiles lues, ' + T.marques.length + ' marques au plan');
  console.log('--- BATTERIES retenues (prix le plus bas par marque / tension / capacite) ---');
  Object.keys(T.batteries).sort().forEach(function (k) {
    var b = T.batteries[k];
    console.log('  ' + k.padEnd(22) + String(b.prix).padStart(9) + ' EUR/u  '
      + ('x' + b.quantiteMinimale).padStart(4) + ' @ ' + String(b.prixDuLot).padStart(8) + '   '
      + b.texte.slice(0, 56));
  });
  console.log('--- CHARGEURS retenus (prix le plus bas par marque / tension) ---');
  Object.keys(T.chargeurs).sort().forEach(function (k) {
    console.log('  ' + k.padEnd(22) + String(T.chargeurs[k].prix).padStart(9) + ' EUR   '
      + T.chargeurs[k].texte.slice(0, 68));
  });
  console.log('--- CARTES ECARTEES, et pourquoi (aucun refus silencieux) ---');
  Object.keys(T.refus).sort(function (a, b) { return T.refus[b] - T.refus[a]; })
    .forEach(function (k) { console.log('  ' + String(T.refus[k]).padStart(5) + '  ' + k); });
}
