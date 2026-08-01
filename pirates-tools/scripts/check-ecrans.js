/* check-ecrans.js — LA PORTE UI/UX, POUR TOUT L'ÉCRAN, PAS QUE LE PAIEMENT.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CETTE PORTE EXISTE

   `check-tunnel-paiement.js` ne garde que la modale de carte. L'user a
   demandé le 01/08/2026 que la même exigence s'applique PARTOUT :

     « à chaque fois qu'on va créer quelque chose sur le site, on se réfère à
       ce qui existe déjà sur les plus grandes institutions et notre CSS doit
       être en accord »

   Le même jour, la réorganisation de la page compte a produit — en bac à
   sable, avant livraison — un bouton « Voir le panier » étiré sur toute la
   hauteur de sa carte, parce que `.actions` avait été imbriqué dans `.specs`.
   Le défaut existait DÉJÀ dans le dépôt et personne ne l'avait vu : aucun
   test ne regarde un écran.

   ─────────────────────────────────────────────────────────────────────────
   CE QUE CETTE PORTE EST — ET CE QU'ELLE N'EST PAS

   Elle vérifie ce qui est OBJECTIF dans le balisage. Chaque famille
   ci-dessous a coûté un défaut réel, ici, sur ce dépôt.

   ⛔ Elle ne juge RIEN de l'esthétique. Elle ne dit pas si c'est joli, si
   l'espacement respire, si la hiérarchie typographique tient. Ces
   questions-là n'ont qu'une réponse : REGARDER L'ÉCRAN.

       node outils/vue.mjs "#/laroute" [--tel] [--connecte]

   ⚠️ Elle ne peut pas consulter de référence extérieure : les sites des
   grandes institutions (economie.gouv.fr, legifrance.gouv.fr)
   répondent 403 depuis l'environnement de travail. Les règles ci-dessous
   viennent donc du DÉPÔT et de pannes vécues, jamais d'une page lue en ligne.
   Ce qui n'a pas pu être vérifié à la source est dit comme tel.

   ⛔ CE CONTRÔLE EST UN PLANCHER. Le franchir ne veut pas dire « c'est bien
   fait » : ça veut dire « ce n'est pas grossièrement cassé ».
   ───────────────────────────────────────────────────────────────────────── */
'use strict';

var fs = require('fs');
var path = require('path');

/* Ratchet : nombre d'attributs `style=` tolérés dans index.html. Il ne monte
   JAMAIS. Une couleur ou une taille écrite en dur échappe aux jetons de
   `styles.css` (--accent, --muted) : le jour où la charte change, ces
   valeurs-là ne suivent pas, et l'écran devient bâtard.

   ⚠️ Le compte se lit ICI, pas avec `grep`. `grep` travaille ligne par ligne
   et RATE un attribut `style=` qui court sur deux lignes — il en annonçait 31
   là où il y en avait 32. Un chiffre faux qui a l'air précis.

   Historique du cliquet, chaque valeur mesurée par ce contrôle lui-même :
     · 01/08/2026 — 32 au moment de poser la porte ;
     · 01/08/2026 — 25, après avoir remplacé sept `margin-top:1.2rem` par la
       classe `.acc-card-next`. */
var PLAFOND_STYLE_INLINE = 25;

module.exports = function () {
  var errors = [];
  function ok(c, m) { if (!c) errors.push('[check-ecrans] ' + m); }

  var RACINE = path.join(__dirname, '..');
  var html;
  try {
    html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  } catch (e) {
    return ['[check-ecrans] index.html illisible — ' + e.message];
  }

  /* ── E1. UN IDENTIFIANT, UN SEUL ÉLÉMENT ────────────────────────────────
     `getElementById` rend le PREMIER. Un doublon fait travailler tout le code
     sur un élément, pendant que l'utilisateur en regarde un autre : la page
     paraît morte sans qu'aucune erreur ne soit levée. Failli arriver le
     01/08/2026 en dupliquant `accHistory` entre l'onglet Profil et l'onglet
     Commandes. */
  var vus = {};
  var doublons = [];
  var reId = /\bid="([^"]+)"/g;
  var m;
  while ((m = reId.exec(html))) {
    if (vus[m[1]]) { if (doublons.indexOf(m[1]) === -1) doublons.push(m[1]); }
    vus[m[1]] = true;
  }
  ok(doublons.length === 0,
    '⛔⛔ identifiant(s) en DOUBLE dans index.html : ' + doublons.join(', ') + '. '
    + '`getElementById` ne rendra que le premier — la moitié de l\'écran restera muette '
    + 'sans lever la moindre erreur.');

  /* ── E2. `.actions` N'EST JAMAIS IMBRIQUÉ DANS `.specs` ─────────────────
     `.specs` est un `display:flex`. Un `.actions` posé dedans devient un
     élément flex étiré sur toute la hauteur, et son bouton se change en pavé
     de couleur. Son retrait (`padding: 0 1.1rem 1.1rem`) n'a d'ailleurs de
     sens qu'en enfant direct de `.card`. Constaté en bac à sable le
     01/08/2026 sur la carte « Mon panier ». */
  /* ⚠️ DEUX PIÈGES PAYÉS ICI MÊME, l'un après l'autre.

     ① La première version cherchait le bloc avec
        `([\s\S]*?)(?=<div class="(?:specs|actions|head)"…)` : la capture
        s'arrêtait JUSTE AVANT `.actions`, donc ne le contenait jamais. Verte
        par construction — le sabotage l'a démasquée.

     ② La deuxième comptait la profondeur des `<div>` et signalait 5 blocs.
        Trois étaient de FAUSSES alertes : ces `.actions`-là sont dans un
        `<form>` qui pose sa propre grille, donc ils ne s'étirent pas. Un
        `<form>` n'est pas un `<div>` : le compteur de profondeur ne le voit
        pas passer.

     Le défaut, c'est d'être un ENFANT DIRECT de `.specs` — donc un élément
     flex de `.specs`. On exige les deux : profondeur 1 ET aucun `<form>`
     ouvert entre les deux. */
  var imbrique = [];
  var reOuv = /<div class="specs"[^>]*>/g;
  var ouv;
  while ((ouv = reOuv.exec(html))) {
    var debut = ouv.index + ouv[0].length;
    var prof = 1;
    var reBal = /<div\b[^>]*>|<\/div>/g;
    reBal.lastIndex = debut;
    var bal;
    while (prof > 0 && (bal = reBal.exec(html))) {
      if (bal[0] === '</div>') { prof--; continue; }
      var direct = prof === 1;
      prof++;
      if (!direct || !/class="[^"]*\bactions\b/.test(bal[0])) continue;
      var entre = html.slice(debut, bal.index);
      var formsOuverts = (entre.match(/<form\b/g) || []).length
        - (entre.match(/<\/form>/g) || []).length;
      if (formsOuverts > 0) continue;
      imbrique.push('ligne ' + (html.slice(0, bal.index).split('\n').length));
    }
  }
  ok(imbrique.length === 0,
    '⛔ `.actions` est enfant direct de `.specs` (' + imbrique.join(', ') + '). `.specs` est '
    + 'un `display:flex` : le bouton s\'étire sur toute la hauteur de la carte et devient un '
    + 'pavé de couleur. `.actions` est un FRÈRE de `.specs`, jamais un enfant.');

  /* ── E3. TOUT CHAMP DE SAISIE VISIBLE PORTE UNE ÉTIQUETTE ───────────────
     Un `placeholder` n'est pas une étiquette : il disparaît à la première
     frappe, et n'est pas annoncé de façon fiable. Sans étiquette, un lecteur
     d'écran annonce « champ de saisie », point.
     ⚠️ Deux exemptions, toutes deux délibérées :
       · `hidden` — le champ n'est pas dans l'arbre d'accessibilité ; c'est le
         bouton visible qui le déclenche qui porte le nom (sélecteurs de
         photo) ;
       · les pots de miel anti-robots, qui doivent rester invisibles ET
         non annoncés — les étiqueter les rendrait inutiles. */
  var pourFor = {};
  (html.match(/<label[^>]*\bfor="([^"]+)"/g) || []).forEach(function (s) {
    pourFor[/for="([^"]+)"/.exec(s)[1]] = true;
  });
  var sansEtiquette = [];
  (html.match(/<(?:input|select|textarea)\b[^>]*>/g) || []).forEach(function (c) {
    if (/type="(?:hidden|submit|button|image)"/.test(c)) return;
    if (/\bhidden\b/.test(c)) return;
    if (/honeypot|name="website"/i.test(c)) return;
    if (/aria-label(?:ledby)?=/.test(c)) return;
    var id = (/\bid="([^"]+)"/.exec(c) || [])[1];
    if (id && pourFor[id]) return;
    /* Enveloppé par un <label> ouvert et non encore refermé ? */
    var i = html.indexOf(c);
    if (html.lastIndexOf('<label', i) > html.lastIndexOf('</label>', i)) return;
    sansEtiquette.push(id || c.slice(0, 60));
  });
  ok(sansEtiquette.length === 0,
    '⛔ champ(s) de saisie sans étiquette : ' + sansEtiquette.join(', ') + '. Un '
    + '`placeholder` disparaît à la première frappe : il ne remplace pas un `<label>` '
    + 'ni un `aria-label`.');

  /* ── E4. TOUT BOUTON A UN NOM ───────────────────────────────────────────
     Un bouton dont le contenu n'est qu'une icône SVG s'annonce « bouton ».
     Vérifié conforme le 01/08/2026 (0 manquant) : cette barrière VERROUILLE
     l'état, elle ne le réclame pas. */
  var reBtn = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
  var muets = [];
  while ((m = reBtn.exec(html))) {
    if (/aria-label(?:ledby)?=/.test(m[1])) continue;
    var txt = m[2].replace(/<[^>]*>/g, '').replace(/&[a-z]+;|&#\d+;/gi, 'x').trim();
    if (!txt) muets.push((/\bid="([^"]+)"/.exec(m[1]) || [])[1] || m[1].trim().slice(0, 50));
  }
  ok(muets.length === 0,
    '⛔ bouton(s) sans nom accessible : ' + muets.join(', ') + '. Une icône seule '
    + 's\'annonce « bouton » et rien d\'autre — ajoute `aria-label`.');

  /* ── E5. LE STYLE EN DUR NE REMONTE PAS ─────────────────────────────────
     Cliquet, pas interdiction : les 31 existants sont un héritage, on ne
     bloque pas le dépôt dessus. Mais une valeur écrite dans `style=` ne suit
     PAS les jetons de la charte (--accent, --muted) : au prochain changement
     de couleur, ces écrans-là restent en arrière. Le compte doit descendre,
     jamais monter. */
  var nInline = (html.match(/style="[^"]*"/g) || []).length;
  ok(nInline <= PLAFOND_STYLE_INLINE,
    '⛔ ' + nInline + ' attributs `style=` dans index.html, pour un cliquet à '
    + PLAFOND_STYLE_INLINE + '. Le style en dur échappe aux jetons de la charte : mets-le '
    + 'dans `styles.css`. Ce plafond DESCEND, il ne monte pas (règle des budgets).');

  return errors;
};

if (require.main === module) {
  var e = module.exports();
  if (e.length) { e.forEach(function (x) { console.error('  ❌ ' + x); }); process.exit(1); }
  console.log('✅ check-ecrans OK');
}
