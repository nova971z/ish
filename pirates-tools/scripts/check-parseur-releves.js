/* check-parseur-releves.js — LE PARSEUR REJOUÉ SUR DE VRAIES CARTES.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ POURQUOI CETTE PORTE EXISTE. Les portes du parseur travaillaient sur des
   cartes que J'AI écrites. Elles vérifient donc ce à quoi je pensais en les
   écrivant. Une campagne de sabotage mécanique (`outils/sabotage-campagne.mjs`)
   l'a chiffré : sur `reconstitution.js`, **68 décisions sur 112 pouvaient être
   retournées sans qu'aucune porte ne rougisse**. Le filet avait des trous
   exactement là où je ne regardais pas.

   ⇒ Cette porte rejoue **1 117 cartes réelles** du fournisseur, gelées depuis
   les relevés de l'user (`data/corpus-parseur.json`), à travers `parseIdealo`
   — le chemin qui ÉCRIT les prix, jamais la grammaire seule.

   ⛔ ELLE N'AFFIRME AUCUN RÉSULTAT PRODUIT PAR PRODUIT, et c'est délibéré :
   « un harnais ne nomme jamais une donnée du catalogue » (`.claude/rules/
   harnais.md`). Elle vérifie des INVARIANTS qui doivent tenir sur n'importe
   quelle carte, plus deux bornes de couverture relues dans le corpus.

   LES INVARIANTS, ET CE QUE CHACUN COÛTE S'IL TOMBE :

   ① UNE RÉFÉRENCE RENDUE EXISTE DANS LE TEXTE DE LA CARTE. Si le parseur
      rend une référence absente du titre et de la description, il l'a
      FABRIQUÉE — et le prix de cette carte ira sur la fiche d'un autre
      produit. C'est le pire défaut possible : un prix juste, sur le mauvais
      article.

   ② LE PRIX RENDU EST LE PRIX DE LA CARTE, AU CENTIME. Toute dérive
      arithmétique entre ce qui est lu et ce qui est écrit est une erreur
      d'argent, quelle que soit sa taille.

   ③ AUCUN PRIX POSITIF NE SORT SANS RÉFÉRENCE. Un prix sans destinataire
      finit par s'écrire quelque part.

   ④ COUVERTURE PLANCHER. Le parseur doit continuer à lire au moins autant de
      cartes qu'au jour du gel. Un parseur qui se met à tout refuser fige les
      prix en silence — c'est invisible, et ça coûte.

   ⑤ COUVERTURE PLAFOND. Et il ne doit pas se mettre à tout ACCEPTER : au-delà
      d'une borne, cela veut dire qu'il a cessé d'écarter les packs, et un prix
      de pack sur une référence nue fait vendre à perte.

   ⚠️ LES DEUX BORNES SONT DES DONNÉES, pas des nombres écrits ici : elles
   vivent dans `data/corpus-parseur.json`, mesurées au gel. Un seuil recopié
   dans un harnais se périme (`.claude/rules/harnais.md`).
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

/* Reconstruit la carte telle que le fournisseur la sert. MÊME forme que
   `scripts/banc-tuiles.js` : si les deux divergent, les mesures ne se
   comparent plus. */
function carte(titre, descr, prix) {
  var l = [String(titre || '').slice(0, 200)];
  if (descr) l.push(String(descr).replace(/\s+/g, ' ').slice(0, 300));
  l.push('En stock');
  l.push('12 offres');
  l.push('à partir de ' + String(Number(prix).toFixed(2)).replace('.', ',') + ' €');
  return l.join('\n');
}

function alphanum(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

module.exports = function checkParseurReleves() {
  var errors = [];
  var corpus, pp;
  /* ⚠️ La lecture se fait DANS la porte, jamais au chargement du module : une
     lecture qui jette rendrait la porte inchargeable, donc morte. */
  try { corpus = JSON.parse(fs.readFileSync(path.join(RACINE, 'data/corpus-parseur.json'), 'utf8')); }
  catch (e) {
    errors.push('[check-parseur-releves] ⛔ corpus illisible (' + e.message
      + ') — la porte n\'a rien vérifié. Regeler : node scripts/geler-corpus-parseur.js <relevés>');
    return errors;
  }
  try { pp = require(path.join(RACINE, 'api/_lib/price-parse.js')); }
  catch (e) {
    errors.push('[check-parseur-releves] ⛔ parseur inchargeable : ' + e.message);
    return errors;
  }
  var cartes = Array.isArray(corpus.cartes) ? corpus.cartes : [];
  /* ⛔ PRÉALABLE : sans carte, la porte verdirait à vide. Non exécuté n'est
     pas vert. */
  if (cartes.length < 100) {
    errors.push('[check-parseur-releves] ⛔ PRÉALABLE : corpus de ' + cartes.length
      + ' cartes — trop maigre pour conclure quoi que ce soit.');
    return errors;
  }

  var lues = 0, items = 0, plantages = 0;
  var faute1 = 0, faute2 = 0, faute3 = 0;
  var exemple1 = null, exemple2 = null, exemple3 = null;
  var parMarque = {};

  cartes.forEach(function (c) {
    var res;
    try { res = pp.parseIdealo(carte(c.titre, c.descr, c.prix), c.marque); }
    catch (e) { plantages++; return; }
    var liste = (res && Array.isArray(res.items)) ? res.items : [];
    if (liste.length) { lues++; parMarque[c.marque] = (parMarque[c.marque] || 0) + 1; }
    items += liste.length;
    var texte = alphanum(c.titre + ' ' + c.descr);

    liste.forEach(function (it) {
      var sku = it && (it.sku || it.ref);
      /* ③ un prix sans destinataire */
      if (!sku) {
        faute3++;
        if (!exemple3) exemple3 = 'carte ' + String(c.titre).slice(0, 60);
        return;
      }
      /* ① la référence doit EXISTER dans le texte */
      if (texte.indexOf(alphanum(sku)) < 0) {
        faute1++;
        if (!exemple1) {
          exemple1 = 'référence rendue absente du texte de la carte (titre : «'
            + String(c.titre).slice(0, 70) + '»)';
        }
      }
      /* ② le prix rendu doit être celui de la carte.
         ⛔⛔ MON PROPRE TROU, ATTRAPÉ PAR SABOTAGE ET C'EST BIEN LE BUT : le
         premier jet lisait `it.srcTTC` puis `it.prix`. Le parseur, lui, rend
         le montant sous `price` — les deux autres champs n'existent PAS sur
         un item. `Number(undefined)` vaut NaN, `isFinite(NaN)` est faux, donc
         l'invariant ne s'exécutait JAMAIS. Sabotage « +0,01 € sur chaque prix
         rendu » : la porte est restée VERTE. Une porte d'argent qui lit un
         champ inexistant est une décoration. */
      var prixRendu = Number(it.price != null ? it.price
        : (it.srcTTC != null ? it.srcTTC : it.prix));
      if (!isFinite(prixRendu)) {
        errors.push('[check-parseur-releves] ⛔ PRÉALABLE : un item rendu sans montant '
          + 'lisible — l\'invariant du prix ne vérifierait plus rien.');
      } else if (Math.abs(prixRendu - Number(c.prix)) > 0.005) {
        faute2++;
        if (!exemple2) {
          exemple2 = 'écart de ' + Math.round((prixRendu - Number(c.prix)) * 100) / 100
            + ' EUR entre le prix lu sur la carte et le prix rendu';
        }
      }
    });
  });

  if (plantages) {
    errors.push('[check-parseur-releves] ⛔ le parseur a JETÉ sur ' + plantages + ' carte(s) '
      + 'réelle(s) sur ' + cartes.length + '. Une exception en production interrompt le '
      + 'balayage : une carte peut en emporter soixante (leçon du 09/08/2026).');
  }
  if (faute1) {
    errors.push('[check-parseur-releves] ⛔⛔ ARGENT — INVARIANT ① : ' + faute1 + ' référence(s) '
      + 'rendue(s) n\'apparaissent PAS dans le texte de leur carte. ' + exemple1
      + '. Une référence fabriquée envoie le prix de cette carte sur la fiche d\'un AUTRE '
      + 'produit : un prix juste, sur le mauvais article.');
  }
  if (faute2) {
    errors.push('[check-parseur-releves] ⛔⛔ ARGENT — INVARIANT ② : ' + faute2 + ' prix rendu(s) '
      + 'diffèrent du prix de la carte. ' + exemple2 + '. Toute dérive entre ce qui est LU et '
      + 'ce qui est ÉCRIT est une erreur d\'argent, si petite soit-elle.');
  }
  if (faute3) {
    errors.push('[check-parseur-releves] ⛔ INVARIANT ③ : ' + faute3 + ' prix rendu(s) sans '
      + 'référence. ' + exemple3 + '. Un prix sans destinataire finit par s\'écrire quelque part.');
  }

  /* ④ et ⑤ — les bornes de couverture, RELUES dans le corpus. */
  var plancher = corpus.plancherLues, plafond = corpus.plafondLues;
  if (!(plancher > 0) || !(plafond > 0)) {
    errors.push('[check-parseur-releves] ⛔ PRÉALABLE : les bornes de couverture manquent au '
      + 'corpus. Sans elles, un parseur qui refuse tout ou accepte tout passerait inaperçu. '
      + 'Regeler le corpus.');
    return errors;
  }
  if (lues < plancher) {
    errors.push('[check-parseur-releves] ⛔⛔ ARGENT — INVARIANT ④ : le parseur ne lit plus que '
      + lues + ' cartes sur ' + cartes.length + ', contre ' + plancher + ' au minimum attendu. '
      + 'Un parseur qui se met à refuser FIGE les prix en silence : aucune alerte, aucune '
      + 'trace, et les coûts vieillissent.');
  }
  if (lues > plafond) {
    errors.push('[check-parseur-releves] ⛔⛔ ARGENT — INVARIANT ⑤ : le parseur lit ' + lues
      + ' cartes sur ' + cartes.length + ', au-dessus du plafond de ' + plafond + '. Il a donc '
      + 'cessé d\'ÉCARTER quelque chose — et ce qu\'il écartait, ce sont les packs. Un prix de '
      + 'pack écrit sur une référence nue fait vendre à perte.');
  }

  /* ⑥ ET LE COMPTE TIENT MARQUE PAR MARQUE.
     ⛔ POURQUOI CE SIXIÈME INVARIANT N'EST PAS UN LUXE : le total peut rester
     JUSTE alors que le parseur s'est mis à lire dix cartes de trop d'un côté
     et dix de moins de l'autre. Deux erreurs qui se compensent au total sont
     deux erreurs quand même — et « chaque marque a sa table » (M-28) est
     précisément l'endroit où une grammaire déborde sur l'autre, ce qui fait
     BAISSER un coût, donc vendre à perte. */
  var attendu = corpus.parMarque || {};
  Object.keys(attendu).forEach(function (mq) {
    if ((parMarque[mq] || 0) !== attendu[mq]) {
      errors.push('[check-parseur-releves] ⛔⛔ ARGENT — INVARIANT ⑥ : le parseur lit '
        + (parMarque[mq] || 0) + ' cartes pour une marque, contre ' + attendu[mq]
        + ' au gel. Le total peut rester juste pendant qu\'une grammaire déborde sur l\'autre : '
        + 'c\'est exactement le défaut M-28, et il fait BAISSER un coût — donc vendre à perte.');
    }
  });
  Object.keys(parMarque).forEach(function (mq) {
    if (!(mq in attendu)) {
      errors.push('[check-parseur-releves] ⛔ INVARIANT ⑥ : le parseur lit désormais des cartes '
        + 'd\'une marque qui n\'en produisait aucune au gel. Un débordement entre marques '
        + 'commence toujours comme ça.');
    }
  });

  /* ⑦ ET SURTOUT : LE RAPPROCHEMENT AVEC LE CATALOGUE.
     ⛔⛔ DÉCOUVERT EN SABOTANT, ET C'EST LE PLUS IMPORTANT DE LA JOURNÉE.
     `parseIdealo(texte, marque)` appelé seul n'atteint JAMAIS les chemins qui
     rapprochent une annonce d'une FICHE (`apparierParRefRecollee`,
     `apparierParConfiguration`, `apparierParNomSouple`) : ils exigent le
     catalogue en argument. Mes deux premiers sabotages sur ces chemins sont
     donc restés verts — non pas parce que la porte les couvrait, mais parce
     qu'ils ne s'exécutaient pas. Or c'est là que se décide **QUELLE FICHE
     reçoit le prix** : la décision d'argent la plus lourde du projet.
     ⇒ On les rejoue ici, avec le vrai catalogue, sur les mêmes cartes. */
  var fiches;
  try { fiches = JSON.parse(fs.readFileSync(path.join(RACINE, 'products.json'), 'utf8')); }
  catch (e) {
    errors.push('[check-parseur-releves] ⛔ PRÉALABLE : catalogue illisible (' + e.message
      + ') — les chemins de rapprochement n\'ont PAS été vérifiés.');
    return errors;
  }
  if (!Array.isArray(fiches) || fiches.length < 100) {
    errors.push('[check-parseur-releves] ⛔ PRÉALABLE : catalogue trop maigre — le rapprochement '
      + 'ne peut rien trouver, et la porte verdirait à vide.');
    return errors;
  }
  var parSku = Object.create(null);
  fiches.forEach(function (p) { if (p.sku) parSku[String(p.sku).toUpperCase()] = p; });

  /* On rejoue les cartes que le parseur a REFUSÉES (`restants` / `sansRef`) :
     ce sont exactement celles que le rapprochement va tenter de sauver, donc
     celles où une erreur écrirait un prix sur la mauvaise fiche. */
  var apparies = 0, horsMarque = 0, surRefNue = 0, prixDevie = 0;
  var exempleHM = null, exempleRN = null;

  cartes.forEach(function (c) {
    var res;
    try { res = pp.parseIdealo(carte(c.titre, c.descr, c.prix), c.marque); }
    catch (e) { return; }
    /* ⛔⛔ SECOND TROU DE MA PROPRE PORTE, ATTRAPÉ EN MESURANT : je passais
       `res.restants` aux fonctions de rapprochement. `parseIdealo` ne rend
       PAS ce champ (il rend `items`, `packs`, `sansRef`, `perdus`) — la porte
       leur passait donc un tableau VIDE et annonçait « 0 rapprochement,
       0 défaut ». Trois invariants d'argent verts sans avoir rien traversé.
       C'est exactement pourquoi un plancher de traversée est OBLIGATOIRE. */
    var restants = [];
    if (res && Array.isArray(res.sansRef)) restants = restants.concat(res.sansRef);
    if (res && Array.isArray(res.perdus)) restants = restants.concat(res.perdus);
    if (!restants.length) return;
    var sorties = [];
    ['apparierParRefRecollee', 'apparierParConfiguration', 'apparierParNomSouple']
      .forEach(function (fn) {
        if (typeof pp[fn] !== 'function') return;
        var r;
        try { r = pp[fn](restants, fiches, c.marque); } catch (e) { return; }
        (r && Array.isArray(r.items) ? r.items : []).forEach(function (it) { sorties.push(it); });
      });
    sorties.forEach(function (it) {
      apparies++;
      var f = parSku[String(it.sku || '').toUpperCase()];
      /* ⛔ JAMAIS ENTRE MARQUES (M-28). Rapprocher deux références de marques
         différentes fait BAISSER un coût — donc vendre à perte. */
      if (f && String(f.brand || '').toUpperCase().replace(/[\s-]/g, '')
          !== String(c.marque || '').toUpperCase().replace(/[\s-]/g, '')) {
        horsMarque++;
        if (!exempleHM) exempleHM = 'une carte a été rapprochée d\'une fiche d\'une AUTRE marque';
      }
      /* ⛔ UN PRIX DE PACK NE S'ÉCRIT JAMAIS SUR UNE RÉFÉRENCE NUE. La carte
         annonce un contenu ajouté ; la fiche visée est une machine seule : son
         coût deviendrait celui du pack, gonflé de tout ce qu'il embarque. */
      var texteC = c.titre + ' ' + c.descr;
      if (typeof pp.referenceEstNue === 'function' && annonceUnContenuAjoute(texteC)) {
        var nue = false;
        try { nue = !!pp.referenceEstNue(it.sku, c.marque); } catch (e) { nue = false; }
        if (nue) {
          surRefNue++;
          if (!exempleRN) {
            exempleRN = 'carte annonçant un contenu ajouté, rapprochée d\'une référence NUE '
              + '(titre : «' + String(c.titre).slice(0, 70) + '»)';
          }
        }
      }
      var px = Number(it.price != null ? it.price : it.srcTTC);
      if (isFinite(px) && Math.abs(px - Number(c.prix)) > 0.005) prixDevie++;
    });
  });

  if (horsMarque) {
    errors.push('[check-parseur-releves] ⛔⛔ ARGENT — INVARIANT ⑦ : ' + horsMarque
      + ' rapprochement(s) ENTRE MARQUES. ' + exempleHM + '. C\'est le défaut M-28, et son sens '
      + 'est le pire : il fait BAISSER un coût, donc vendre à perte.');
  }
  if (surRefNue) {
    errors.push('[check-parseur-releves] ⛔⛔ ARGENT — INVARIANT ⑦ : ' + surRefNue + ' carte(s) '
      + 'annonçant un contenu ajouté ont été rapprochées d\'une référence NUE. ' + exempleRN
      + '. Le prix du pack irait sur la fiche de la machine seule : un coût gonflé de tout ce '
      + 'que le pack embarque, sur un article qui ne le contient pas.');
  }
  if (prixDevie) {
    errors.push('[check-parseur-releves] ⛔⛔ ARGENT — INVARIANT ⑦ : ' + prixDevie + ' prix '
      + 'rapproché(s) diffèrent du prix de la carte.');
  }
  /* ⛔ PRÉALABLE : si le rapprochement ne rend RIEN, les trois assertions
     ci-dessus sont vraies sans avoir rien traversé. */
  var plancherApp = corpus.plancherApparies;
  if (!(plancherApp > 0)) {
    errors.push('[check-parseur-releves] ⛔ PRÉALABLE : le corpus ne porte pas de plancher de '
      + 'rapprochement — les invariants ⑦ pourraient être verts sans avoir rien traversé.');
  } else if (apparies < plancherApp) {
    errors.push('[check-parseur-releves] ⛔ INVARIANT ⑦ : ' + apparies + ' rapprochement(s) '
      + 'contre ' + plancherApp + ' au gel. Soit le rapprochement s\'est mis à refuser (les '
      + 'coûts vieillissent en silence), soit la porte ne traverse plus rien.');
  }
  return errors;
};

/* Le texte annonce-t-il un contenu AJOUTÉ à la machine ? On reste conservateur :
   ce qui compte ici est de ne pas manquer un pack, quitte à en soupçonner un
   de trop — le contrôle qui suit ne condamne que si la fiche visée est NUE. */
function annonceUnContenuAjoute(t) {
  return /\d\s*[xX×]\s*\d+(?:[.,]\d+)?\s*Ah/i.test(t)
    || /\bavec\s+(?:\d+\s+)?(?:batteries?|chargeurs?|coffrets?|mallettes?)/i.test(t)
    || /\+\s*(?:\d+\s*[xX×]?\s*)?(?:batteries?|chargeurs?|coffrets?|mallettes?)/i.test(t)
    || /\b(?:lots?|packs?|kits?)\s+(?:de\s+)?\d{1,2}\b/i.test(t);
}

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-parseur-releves : le parseur tient ses invariants sur les cartes réelles');
}
