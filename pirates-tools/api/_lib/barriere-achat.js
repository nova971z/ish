/* barriere-achat.js — CE QU'ON REFUSE D'ACHETER, ET POURQUOI.
 *
 * ⛔ CE FICHIER EST FAIT POUR ÊTRE CHANGÉ. L'user, le 03/08/2026 : « il faut
 * créer une barrière mais facile à enlever ou à modifier ». Tout est donc ici,
 * en clair, avec le motif de chaque seuil et ce qu'il faut faire pour le lever.
 * Aucun de ces nombres n'est écrit ailleurs dans le code.
 *
 * ⛔⛔ UNE BARRIÈRE N'EFFACE JAMAIS RIEN. Elle ÉCARTE, et ce qui est écarté
 * reste listé avec son motif. C'est la règle du projet depuis le premier jour :
 * un vide se voit, un article disparu ne se voit pas — et le jour où l'user
 * lève la barrière, il doit retrouver exactement ce qu'elle retenait.
 *
 * ⚠️ J4 — cette barrière décide quelles sources entrent dans le COÛT d'achat.
 * Le coût retenu est le MINIMUM des sources valables : écarter à tort, c'est
 * retenir un coût trop haut, donc vendre trop cher. Laisser passer à tort,
 * c'est adosser un prix de vente à une offre qu'il ne peut pas honorer.
 */

var SEUILS = {
  /* ── DÉLAI DE LIVRAISON ────────────────────────────────────────────────
     ⛔ POURQUOI : l'user ne vend aujourd'hui QUE de l'envoi, pas de retrait
     sur place. Un fournisseur à trois semaines bloque une commande client
     qu'il a déjà encaissée.
     ⚠️ TEMPORAIRE, et il l'a dit lui-même : « lorsque je commanderai par
     conteneur, il se peut que je commande avec des délais plus longs, ce qui
     ne me dérangera pas à ce moment-là ».
     ⛔ POUR LA LEVER : mettre `null`. Pour l'assouplir : changer le nombre.
     Rien d'autre à toucher, nulle part. */
  delaiMaxJours: 8,

  /* ── FOURCHETTE DE PRIX ────────────────────────────────────────────────
     ⛔ POURQUOI : un montant hors de cette fourchette n'est pas le prix d'un
     outil de cette marque — c'est un frais de port, un accessoire du bandeau
     voisin, ou une valeur aberrante. Douze annonces sont déjà sorties à
     3,23 €, 9,95 €, 8,00 € le 03/08 : le prix était celui du PORT.
     ⚠️ Bornes données par l'user le 03/08 : « les prix sont compris entre
     50 000 € et 50 € » — volontairement LARGES, il l'a précisé. Ce sont des
     garde-fous, pas une estimation : les resserrer sans mesure écarterait de
     vrais articles.
     ⛔ POUR LES LEVER : mettre `null`. */
  prixMinEuros: 50,
  prixMaxEuros: 50000
};

/* ⛔ « 3 à 6 jours ouvrés », « 24/48 heures », « 1-2 jours ouvrables »… Le
   délai s'écrit de dix façons, et on retient TOUJOURS LE PIRE des deux bouts :
   une barrière qui lit « 3 » dans « 3 à 6 jours » laisserait passer une offre
   à six jours en croyant en compter trois. Le pire, c'est ce qu'on subit.
   ⚠️ Rend `null` quand aucun délai n'est écrit — et `null` n'est PAS zéro : on
   ne sait pas, donc la barrière ne tranche pas là-dessus (voir `juger`). */
function delaiEnJours(texte) {
  var s = String(texte || '').toLowerCase();
  if (!s) return null;

  /* Les heures d'abord : « 24/48 heures », « sous 24 h », « 48h ». Une offre
     en heures est toujours plus rapide qu'une offre en jours — on convertit
     en jours ARRONDIS AU-DESSUS, jamais en dessous. */
  var mh = s.match(/(\d{1,3})\s*(?:\/|à|a|-)\s*(\d{1,3})\s*(?:h\b|heures?)/);
  if (mh) return Math.ceil(Math.max(+mh[1], +mh[2]) / 24);
  mh = s.match(/(?:sous\s*)?(\d{1,3})\s*(?:h\b|heures?)/);
  if (mh) return Math.ceil(+mh[1] / 24);

  /* Puis les jours, avec ou sans fourchette. « ouvrés » et « ouvrables » ne
     changent rien au pire : on ne convertit pas en jours calendaires, ce
     serait inventer un calendrier. */
  var mj = s.match(/(\d{1,3})\s*(?:\/|à|a|-)\s*(\d{1,3})\s*jours?/);
  if (mj) return Math.max(+mj[1], +mj[2]);
  mj = s.match(/(\d{1,3})\s*jours?/);
  if (mj) return +mj[1];

  /* « Semaines » : trois semaines, c'est vingt et un jours, et c'est
     exactement le cas que l'user veut écarter. */
  var ms = s.match(/(\d{1,2})\s*(?:\/|à|a|-)\s*(\d{1,2})\s*semaines?/);
  if (ms) return Math.max(+ms[1], +ms[2]) * 7;
  ms = s.match(/(\d{1,2})\s*semaines?/);
  if (ms) return +ms[1] * 7;

  return null;
}

/* ⛔⛔ LE JUGEMENT EST PUR ET IL DIT POURQUOI. Un refus sans motif est un mur :
   l'user doit pouvoir lire la ligne écartée et comprendre laquelle des deux
   barrières l'a retenue — sinon il ne saura pas laquelle lever.
   ⚠️ UNE IGNORANCE NE REFUSE PAS. Délai inconnu (`null`) ⇒ la barrière du
   délai ne s'applique pas : écarter faute d'information reviendrait à écarter
   la moitié d'un catalogue parce qu'un site est avare en détails, et le coût
   d'achat remonterait sans qu'aucun fait ne le justifie. */
function juger(o, seuils) {
  var s = seuils || SEUILS;
  var prix = (o && typeof o.prix === 'number') ? o.prix : null;
  var delai = (o && typeof o.delaiJours === 'number') ? o.delaiJours : null;

  if (prix != null && s.prixMinEuros != null && prix < s.prixMinEuros) {
    return { retenu: false, motif: 'prix ' + prix + ' € sous le plancher de '
      + s.prixMinEuros + ' € — ce n\'est pas le prix d\'un outil (frais de port ?)' };
  }
  if (prix != null && s.prixMaxEuros != null && prix > s.prixMaxEuros) {
    return { retenu: false, motif: 'prix ' + prix + ' € au-dessus du plafond de '
      + s.prixMaxEuros + ' €' };
  }
  if (delai != null && s.delaiMaxJours != null && delai > s.delaiMaxJours) {
    return { retenu: false, motif: 'délai ' + delai + ' jours au-delà de la barrière '
      + 'de ' + s.delaiMaxJours + ' jours — TEMPORAIRE, on ne fait que de l\'envoi. '
      + 'Se lève dans api/_lib/barriere-achat.js, seuil `delaiMaxJours`' };
  }
  return { retenu: true, motif: null };
}

module.exports = { SEUILS: SEUILS, delaiEnJours: delaiEnJours, juger: juger };
