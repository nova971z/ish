/* check-visuel-produit.js — UN VISUEL PRODUIT SE FABRIQUE D'UNE SEULE FAÇON.
   ─────────────────────────────────────────────────────────────────────────
   ⛔⛔ CE QUE CETTE PORTE FERME, exigé par l'user le 15/08/2026, après trois
   remontées sur le même sujet :
     « on a gravé comment faire pour ajouter des produits correctement […]
       cette méthode est la bonne, il me semble que tu utilises du WebP.
       Quand moi j'ajoute des produits ou des images aux produits, je veux
       EXACTEMENT la même méthode, celle qui marche et pas une autre. »

   Il y avait DEUX méthodes, et c'est ça le défaut de fond :
     · la mienne — `outils/poser-visuel.mjs` — WebP à qualité 0,92, 2000 px,
       transparence vérifiée sur les pixels AVANT et relue APRÈS conversion,
       plafond 871 Ko. Mesuré sur les 310 posters posés : médiane 146 Ko.
     · la sienne — l'admin dans `app.js` — qualité dégressive de 0,95 à 0,72,
       aucun contrôle après conversion, plafond différent. Ses visuels
       montaient à 525 Ko et sortaient flous, ou sur fond noir.

   Deux méthodes pour un même geste, c'est la garantie que l'une des deux
   pourrira — et c'est celle de l'user qui a pourri, parce que c'est la seule
   que je ne regardais jamais tourner.

   ⇒ Les trois nombres qui décident de la qualité d'un visuel doivent être
   IDENTIQUES des deux côtés. Cette porte les relit dans les deux fichiers et
   refuse le moindre écart. Elle ne juge pas les valeurs : elle refuse la
   DIVERGENCE. Le jour où 0,92 doit changer, il change aux deux endroits.

   ⚠️ Même doctrine que `check-pricing.js` pour la formule de prix : une
   formule qui vit en deux exemplaires finit par donner deux réponses.
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');
var RACINE = path.join(__dirname, '..');

/* Les trois nombres, et où les lire de chaque côté. Le motif nomme la
   constante : chercher un nombre nu attraperait n'importe quoi. */
var ACCORDS = [
  { quoi: 'le côté maximal du visuel (px)',
    ici: /var VISUEL_COTE = (\d+)/, la: /const COTE = (\d+)/ },
  { quoi: 'la qualité d\'encodage WebP',
    ici: /var VISUEL_QUALITE = ([\d.]+)/, la: /toDataURL\('image\/webp', ([\d.]+)\)/ },
  { quoi: 'le plafond de poids d\'un visuel (Ko)',
    ici: /var VISUEL_PLAFOND_KO = (\d+)/, la: /const PLAFOND_KO = (\d+)/ }
];

module.exports = function () {
  var errors = [];
  var fApp = path.join(RACINE, 'app.js');
  var fOutil = path.join(RACINE, 'outils/poser-visuel.mjs');

  /* ⛔ PRÉALABLE : les deux fichiers doivent exister. Une porte qui ne trouve
     rien à comparer serait verte sans avoir rien comparé. */
  if (!fs.existsSync(fApp) || !fs.existsSync(fOutil)) {
    errors.push('[check-visuel-produit] ⛔ app.js ou outils/poser-visuel.mjs est introuvable : '
      + 'impossible de comparer les deux méthodes de fabrication d\'un visuel.');
    return errors;
  }
  var app = fs.readFileSync(fApp, 'utf8');
  var outil = fs.readFileSync(fOutil, 'utf8');

  ACCORDS.forEach(function (a) {
    var mIci = app.match(a.ici);
    var mLa = outil.match(a.la);
    if (!mIci) {
      errors.push('[check-visuel-produit] ⛔ ' + a.quoi + ' : la constante a disparu d\'app.js. '
        + 'L\'admin a cessé de suivre la méthode de poser-visuel.mjs — c\'est exactement '
        + 'la divergence que l\'user a payée trois fois.');
      return;
    }
    if (!mLa) {
      errors.push('[check-visuel-produit] ⛔ ' + a.quoi + ' : la valeur de référence a disparu '
        + 'd\'outils/poser-visuel.mjs. La source de vérité doit rester lisible, sinon la '
        + 'comparaison n\'a plus de sens.');
      return;
    }
    if (Number(mIci[1]) !== Number(mLa[1])) {
      errors.push('[check-visuel-produit] ⛔ ' + a.quoi + ' DIVERGE : app.js dit ' + mIci[1]
        + ', outils/poser-visuel.mjs dit ' + mLa[1] + '. Les visuels ajoutés par l\'admin '
        + 'ne ressembleraient plus à ceux du site. Aligner les deux, ou changer les deux.');
    }
  });

  /* ⛔ ET LE CONTRÔLE QUI COMPTE LE PLUS : après conversion, la transparence
     doit être RELUE, et l'aplatissement REFUSÉ. C'est ce contrôle-là qui
     manquait côté admin, et c'est lui qui a produit le carré noir. Un accord
     sur trois nombres ne sert à rien si le refus n'existe pas. */
  /* ⚠️ ON CHERCHE LA COMPARAISON, PAS LE MOT. Premier jet de cette porte :
     elle exigeait la présence du mot « aplati ». Sabotage du 15/08/2026 —
     `if (coin !== 0)` remplacé par `if (false)` — elle est restée VERTE, parce
     que le mot survivait dans la branche devenue morte. Une porte qui lit du
     vocabulaire au lieu d'une condition ne garde rien. */
  if (!/getImageData\(0, 0, 1, 1\)\.data\[3\]/.test(app)
      || !/if \(coin !== 0\)\s*\{\s*aplati = true/.test(app)) {
    errors.push('[check-visuel-produit] ⛔ app.js ne relit plus le coin après conversion : '
      + 'un encodage qui aplatit le fond passerait sans un mot, et le visuel arriverait sur '
      + 'un carré noir (sa capture du 15/08/2026). poser-visuel.mjs, lui, refuse dans ce cas.');
  }
  if (!/sortie\.coin\[3\] !== 0/.test(outil)) {
    errors.push('[check-visuel-produit] ⛔ outils/poser-visuel.mjs ne vérifie plus la '
      + 'transparence après conversion : la référence elle-même a perdu la garantie que '
      + 'l\'admin est censé copier.');
  }

  /* ⛔ La qualité ne se dégrade JAMAIS par paliers côté admin : c'est ce qui
     rendait ses visuels flous alors que les miens sont nets. Un tableau de
     qualités décroissantes qui reviendrait ici serait un retour en arrière. */
  if (/var paliers = \[0\.9\d[\s\S]{0,60}0\.7\d\]/.test(app)) {
    errors.push('[check-visuel-produit] ⛔ app.js redescend la qualité par paliers. La méthode '
      + 'de référence n\'a qu\'UNE qualité et ne cède que sur la RÉSOLUTION : c\'est ce qui '
      + 'donne des posters à 146 Ko de médiane et nets. Retirer les paliers.');
  }

  return errors;
};

if (require.main === module) {
  var errs = module.exports();
  if (errs.length) { errs.forEach(function (e) { console.error('  ❌ ' + e); }); process.exit(1); }
  console.log('✅ check-visuel-produit : l\'admin fabrique ses visuels exactement comme '
    + 'outils/poser-visuel.mjs');
}
