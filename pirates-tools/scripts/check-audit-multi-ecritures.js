/* check-audit-multi-ecritures.js — L'AUDIT QUI CHERCHE LES FAUX JUMEAUX
   NE DOIT PAS EN FABRIQUER.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ POURQUOI CETTE PORTE EXISTE : `audit/prix-multi-ecritures.js` s'est
   trompé TROIS FOIS, et chaque fois dans le sens qui fait VENDRE À PERTE —
   il propose de retenir un coût PLUS BAS pour une fiche.
     ① 10/08/2026 — il comparait le NOMBRE de batteries sans la CAPACITÉ :
        2×5,0 Ah et 2×2,0 Ah sortaient « même conditionnement », et il
        proposait le kit à 87,91 € de moins pour la fiche du gros kit.
     ② 10/08/2026 — il découpait TOUTES les références avec la grammaire
        d'UNE marque : sur une autre, deux coffrets d'outils différents
        tombaient sur la même racine. Neuf faux jumeaux d'un coup, dont un à
        148,41 € d'écart.
     ③ 11/08/2026 — dès le premier passage sur la marque qu'on venait
        d'inscrire : « …N » (outil nu, 126 €) et « …NDS » (appareil seul
        **+ DS150**, 117 €) sortaient « même conditionnement ». La grammaire
        DISAIT pourtant `inconnus: ["D","S"]`. Une grammaire qui lit
        PARTIELLEMENT est plus dangereuse qu'une qui échoue : l'échec rend
        `null` et le classement le voit ; la lecture partielle rend un objet
        d'apparence complète.

   ⚠️ CETTE PORTE TESTE LE CLASSEMENT, pas la mise en forme du rapport. Elle
   rejoue l'audit en vrai (processus séparé, relevé fabriqué) et lit le degré
   de certitude qu'il attribue.
   ⛔ AUCUNE DONNÉE DU CATALOGUE N'EST NOMMÉE ICI : les sujets se choisissent
   à l'EXÉCUTION, sur un critère de forme. Dix-huit harnais sont morts pour
   avoir nommé un produit.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var RACINE = path.join(__dirname, '..');

module.exports = function checkAuditMultiEcritures() {
  var errors = [];
  var audit = path.join(RACINE, 'audit', 'prix-multi-ecritures.js');
  var produits = path.join(RACINE, 'products.json');
  if (!fs.existsSync(audit) || !fs.existsSync(produits)) {
    errors.push('[check-audit-multi-ecritures] ⛔ PRÉALABLE : audit ou catalogue absent — '
      + 'une porte qui ne lit rien ne vérifie rien.');
    return errors;
  }

  var nomen, catalogue;
  try {
    nomen = require(path.join(RACINE, 'api/_lib/nomenclature.js'));
    catalogue = JSON.parse(fs.readFileSync(produits, 'utf8'));
  } catch (e) {
    errors.push('[check-audit-multi-ecritures] ⛔ chargement impossible : ' + e.message);
    return errors;
  }

  /* ⛔⛔ M-32 — UNE GRAMMAIRE ÉCRITE N'EST PAS UNE GRAMMAIRE BRANCHÉE.
     L'audit a tourné des jours en annonçant « aucune grammaire déclarée » pour
     une marque dont la nomenclature existait, était exportée, et servait déjà
     au parseur. Elle n'était pas INSCRITE dans sa table. On vérifie donc que
     toute marque qui a une grammaire chez `nomenclature.js` est inscrite ici —
     sinon l'audit est aveugle sur elle ET le dit d'une phrase rassurante. */
  var src = fs.readFileSync(audit, 'utf8');
  var bloc = src.match(/var GRAMMAIRES\s*=\s*\{[^}]*\}/);
  var GRAMMAIRE_DISPONIBLE = { MAKITA: 'lireSuffixeMakita', DEWALT: 'lireSuffixeDewalt' };
  Object.keys(GRAMMAIRE_DISPONIBLE).forEach(function (marque) {
    if (typeof nomen[GRAMMAIRE_DISPONIBLE[marque]] !== 'function') return;  // pas écrite : rien à exiger
    if (!bloc || bloc[0].indexOf(marque) === -1) {
      errors.push('[check-audit-multi-ecritures] ⛔⛔ ' + marque + ' a une grammaire de '
        + 'référence dans `api/_lib/nomenclature.js`, mais elle n\'est PAS inscrite dans '
        + '`GRAMMAIRES` de l\'audit : il sort sans rien regarder et annonce « aucune '
        + 'grammaire déclarée ». Une phrase rassurante sur une marque entière — c\'est '
        + 'M-32, une table écrite que personne n\'appelle.');
    }
  });

  /* ── Le sujet se CHOISIT à l'exécution, sur une forme ────────────────────
     Il faut une fiche de cette marque dont la grammaire lit un suffixe SANS
     aucun code inconnu : c'est la seule base saine pour fabriquer le témoin. */
  var base = null;
  for (var i = 0; i < catalogue.length && !base; i++) {
    var p = catalogue[i];
    if (!p || !p.sku) continue;
    if (String(p.brand || '').toUpperCase().replace(/[\s-]/g, '') !== 'DEWALT') continue;
    var sku = String(p.sku).toUpperCase();
    if (/-[A-Z0-9]{1,3}$/.test(sku)) continue;            // marquage régional : on simplifie
    var l = nomen.lireSuffixeDewalt(sku);
    if (l && l.suffixe && (!l.inconnus || !l.inconnus.length)) base = sku;
  }
  if (!base) {
    errors.push('[check-audit-multi-ecritures] ⛔ PRÉALABLE : aucune fiche ne remplit le '
      + 'critère (suffixe lu, aucun code inconnu). Sans sujet, cette porte n\'a RIEN '
      + 'vérifié — elle échoue au lieu de verdir à vide.');
    return errors;
  }

  /* ⛔ LE TÉMOIN : la MÊME machine, plus deux lettres que la grammaire ne sait
     PAS lire. C'est le cas mesuré (« + DS150 »), réduit à sa forme. Le témoin
     est MOINS CHER : c'est le sens qui fait vendre à perte. */
  var releve = [
    { sku: base, srcTTC: 200, titre: 'ZZTEMOIN forme nue' },
    { sku: base + 'DS', srcTTC: 150, titre: 'ZZTEMOIN forme a code non lu' }
  ];
  var tmp = path.join(os.tmpdir(), 'zz-multi-ecritures-' + process.pid + '.json');
  var sortie;
  try {
    fs.writeFileSync(tmp, JSON.stringify(releve), 'utf8');
    sortie = cp.execFileSync(process.execPath, [audit, tmp, '--marque', 'DEWALT'],
      { encoding: 'utf8', cwd: RACINE });
  } catch (e) {
    errors.push('[check-audit-multi-ecritures] ⛔ l\'audit n\'a pas tourné : '
      + (e && e.message));
    try { fs.unlinkSync(tmp); } catch (e2) { /* rien à nettoyer */ }
    return errors;
  }
  try { fs.unlinkSync(tmp); } catch (e3) { /* rien à nettoyer */ }

  /* ⚠️ PRÉALABLE — si l'audit n'a rien trouvé du tout, l'assertion suivante
     serait verte à vide. Le témoin DOIT produire une trouvaille. */
  if (!/ÉCART/.test(sortie)) {
    errors.push('[check-audit-multi-ecritures] ⛔ PRÉALABLE : le témoin n\'a produit '
      + 'AUCUNE trouvaille — l\'assertion sur le degré de certitude serait verte sans '
      + 'rien avoir classé. Sujet retenu : forme « racine + suffixe lu », plus deux '
      + 'lettres non lisibles.');
    return errors;
  }
  if (/2 PROBABLE|1 CERTAIN/.test(sortie)) {
    errors.push('[check-audit-multi-ecritures] ⛔⛔ ARGENT : deux écritures dont l\'une '
      + 'porte un code que la grammaire NE SAIT PAS LIRE sont classées « probable » ou '
      + '« certain ». On ignore ce que ce code ajoute à la boîte ; retenir le coût le '
      + 'plus bas ferait BAISSER le prix de vente d\'un produit plus complet — donc '
      + 'vendre à perte. Un code non lu interdit de conclure « même contenu ».');
  }

  /* ⛔ ET LA RACINE NE DOIT PAS SE RACCOURCIR TOUTE SEULE — c'est la panne ②.
     Deux références de la même famille qui ne diffèrent QUE par leur dernier
     chiffre sont deux produits différents : elles ne se regroupent pas. */
  var famille = null;
  for (var j = 0; j < catalogue.length && !famille; j++) {
    var q = catalogue[j];
    if (!q || !q.sku) continue;
    if (String(q.brand || '').toUpperCase().replace(/[\s-]/g, '') !== 'DEWALT') continue;
    var s2 = String(q.sku).toUpperCase();
    var lu = nomen.lireSuffixeDewalt(s2);
    /* Forme visée : la tête consomme TOUS les chiffres, il ne reste aucun
       suffixe — c'est le cas des coffrets d'outils qui avaient fait les neuf
       faux jumeaux. */
    if (lu && !lu.suffixe && /\d{3,}$/.test(s2)) famille = s2;
  }
  if (famille) {
    var voisine = famille.replace(/\d$/, function (d) { return String((Number(d) + 1) % 10); });
    var r1 = nomen.lireSuffixeDewalt(famille), r2 = nomen.lireSuffixeDewalt(voisine);
    var rac = function (s, l) {
      var sr = s.replace(/-[A-Z0-9]{1,3}$/, ''), su = String(l.suffixe || '');
      return su && sr.slice(-su.length) === su ? sr.slice(0, sr.length - su.length) : sr;
    };
    if (rac(famille, r1) === rac(voisine, r2)) {
      errors.push('[check-audit-multi-ecritures] ⛔⛔ ARGENT : deux références qui ne '
        + 'diffèrent que par leur dernier chiffre rendent la MÊME racine — ce sont deux '
        + 'produits différents, et les regrouper propose le prix de l\'un pour l\'autre. '
        + 'C\'est la panne des neuf faux jumeaux (148,41 € d\'écart sur l\'un d\'eux).');
    }
  }

  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-audit-multi-ecritures : l\'audit ne fabrique pas les jumeaux qu\'il cherche');
}
