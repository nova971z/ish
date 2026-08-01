/* outils/purge-commentaires.mjs — RÉÉCRIRE DES COMMENTAIRES, ET LE PROUVER.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE, ET CE QU'IL A REMPLACÉ

   Un premier outil (`purge-stripe.mjs`, retiré le 01/08/2026) analysait déjà
   avec un parseur et reparsait avant d'écrire. Ça évite d'écrire un fichier
   qui ne se parse plus. **Ça ne prouve pas que le code n'a pas changé.** Un
   fichier peut se parser parfaitement et avoir changé de sens : une chaîne de
   caractères modifiée, un identifiant renommé, un opérateur déplacé se
   parsent tous très bien.

   Il portait aussi le nom qu'on cherchait précisément à faire disparaître, et
   sa table de règles écrivait « l ancien fournisseur » sans apostrophe — ce
   qui a semé une centaine de tournures bancales. Deux outils qui font la même
   chose finissent toujours par diverger : celui-ci reprend tout, en mieux,
   et l'autre est parti.

   « Ça se parse encore » est donc un contrôle qui rassure sans rien garantir
   — exactement le genre de vert qui a déjà coûté cher ici.

   ─────────────────────────────────────────────────────────────────────────
   LA PREUVE QUE CET OUTIL APPORTE, ET QUI EST LA SEULE QUI VAILLE

   Avant d'écrire quoi que ce soit, il construit DEUX FOIS le « code nu » :
   le fichier privé de tous ses commentaires, chaque plage de commentaire
   étant retrouvée par le PARSEUR, pas devinée.

     · une fois sur la source d'origine ;
     · une fois sur le résultat, reparsé INDÉPENDAMMENT (ses commentaires ont
       changé de longueur, donc de position — on ne peut pas réutiliser les
       plages d'avant).

   Ces deux textes doivent être **identiques à l'octet près**. Sinon le
   fichier n'est pas écrit, et l'outil dit où ça diverge.

   Deuxième preuve, indépendante de la première : les FLUX DE JETONS
   (`esprima.tokenize`) doivent être identiques eux aussi. La première preuve
   compare des octets, la seconde compare ce que le moteur JavaScript voit
   réellement. Il faudrait un défaut très particulier pour tromper les deux.

   ─────────────────────────────────────────────────────────────────────────
   CE QU'IL REFUSE DE TOUCHER

   ① Tout ce qui n'est pas un commentaire. Une chaîne de caractères qui
      contient le même texte n'est PAS réécrite — c'est précisément ce qui a
      cassé le dépôt le 01/08/2026 : une apostrophe insérée dans une chaîne à
      guillemets simples.
   ② Les identifiants de DONNÉES (`GARDER`) : champs qui existent en base.
      Un commentaire qui les explique doit continuer à les nommer, sinon il
      ment sur la donnée réelle.

   USAGE
     node outils/purge-commentaires.mjs --verifier <fichier…>   (n'écrit rien)
     node outils/purge-commentaires.mjs <fichier…>
   ───────────────────────────────────────────────────────────────────────── */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { RACINE } from '../tests/_socle.mjs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const esprima = require(join(RACINE, 'node_modules', 'esprima'));

/* ─────────────────────────────────────────────────────────────────────────
   LA TABLE DE RÈGLES

   L'outil précédent écrivait volontairement « l ancien fournisseur » SANS
   apostrophe : au moment où il a été écrit, une apostrophe était le caractère
   qui venait de tout casser, et l'éviter était prudent. Le résultat est du
   français bancal répété une centaine de fois.

   Maintenant que la réécriture passe par le parseur ET par la preuve
   d'identité du code, une apostrophe dans un commentaire ne peut plus rien
   casser : elle est écrite entre `/*` et `*​/`, ou après `//`. On répare.

   ⚠️ L'ordre compte : les formes en MAJUSCULES d'abord, sinon la règle
   minuscule ne les verrait pas, et les tournures composées avant la forme
   simple, sinon on obtient « la partie l'ancien fournisseur ». */
const REGLES = [
  // ① Formes composées — la préposition manquante se remet en même temps.
  [/\bla partie l ancien fournisseur\b/g, "la partie de l'ancien fournisseur"],
  [/\ble chemin l ancien fournisseur\b/g, "le chemin de l'ancien fournisseur"],
  [/\bles paiements l ancien fournisseur\b/g, "les paiements de l'ancien fournisseur"],
  [/\bpaiements l ancien fournisseur\b/g, "paiements de l'ancien fournisseur"],
  [/\bune l ancien fournisseur\b/g, "une notification de l'ancien fournisseur"],
  [/\bl ancien fournisseur tardive\b/g, "notification tardive de l'ancien fournisseur"],
  [/\bmode l ancien fournisseur\b/g, "mode de l'ancien fournisseur"],
  [/\bavec l ancien fournisseur le\b/g, "avec l'ancien fournisseur le"],

  // ② Début de phrase : après un point ou un tiret cadratin, la majuscule.
  [/([.!?]\s+)l ancien fournisseur\b/g, (_, p) => p + "L'ancien fournisseur"],

  // ③ Forme simple — en dernier, pour ne pas court-circuiter les précédentes.
  [/\bL ANCIEN FOURNISSEUR\b/g, "L'ANCIEN FOURNISSEUR"],
  [/\bl ancien fournisseur\b/g, "l'ancien fournisseur"],

  /* ④ APPOSITION SANS PRÉPOSITION — « widget Stripe » est devenu « widget
     l'ancien fournisseur ». En français un nom propre s'appose directement,
     un groupe nominal non : il faut « du fournisseur ».
     ⛔ Chaînes LITTÉRALES, pas une règle générale du genre
     `/(\w+) l'ancien fournisseur/ → "$1 de l'ancien fournisseur"` : elle
     abîmerait toutes les formes déjà correctes (« par », « chez », « quitter
     l'ancien fournisseur »). Une liste finie qu'on a lue vaut mieux qu'une
     règle élégante qu'on n'a pas éprouvée. */
  [/\bContraintes l'ancien fournisseur\b/g, 'Contraintes du fournisseur'],
  [/\bmetadata l'ancien fournisseur\b/g, 'metadata du fournisseur'],
  [/\bwebhook l'ancien fournisseur\b/g, 'webhook du fournisseur'],
  [/\bwidget l'ancien fournisseur\b/g, 'widget du fournisseur'],
  [/\bfrais l'ancien fournisseur\b/g, 'frais du fournisseur'],
  [/\bcommission l'ancien fournisseur\b/g, 'commission du fournisseur'],
  [/\bCommission l'ancien fournisseur\b/g, 'Commission du fournisseur'],
  [/\badresse l'ancien fournisseur\b/g, 'adresse du fournisseur'],
  [/\bminimum l'ancien fournisseur\b/g, 'minimum du fournisseur'],
  [/\bre-livraison l'ancien fournisseur\b/g, 're-livraison du fournisseur'],
  [/\bchemin l'ancien fournisseur\b/g, "chemin de l'ancien fournisseur"],
  [/\bpartie l'ancien fournisseur\b/g, "partie de l'ancien fournisseur"],
  [/\bbranches l'ancien fournisseur\b/g, "branches de l'ancien fournisseur"],
  [/\bd'objets l'ancien fournisseur\b/g, "d'objets chez le fournisseur"],
  [/\bd'événements l'ancien fournisseur\b/g, "d'événements du fournisseur"],
  [/\bidentifiant l'ancien fournisseur\/commande\b/g, 'identifiant fournisseur/commande'],
  [/\(visible l'ancien fournisseur\/antifraude/g, '(visible côté fournisseur/antifraude'],

  /* ⑤ PROSE ANGLAISE — `api/webhook.js`, `api/test-email.js` et deux contrôles
     sont commentés en anglais. Y insérer un groupe nominal français donnait
     « l'ancien fournisseur signs the exact request bytes ». On reste en
     anglais : « the payment provider ». */
  [/\ba l'ancien fournisseur PaymentIntent\b/g, 'a payment provider PaymentIntent'],
  [/\bl'ancien fournisseur webhook for\b/g, 'Payment provider webhook for'],
  [/\bl'ancien fournisseur signs\b/g, 'The payment provider signs'],
  [/\bl'ancien fournisseur delivers\b/g, 'The payment provider delivers'],
  [/\bl'ancien fournisseur collected\b/g, 'the payment provider collected'],
  [/\bwhat l'ancien fournisseur is\b/g, 'what the payment provider is'],
  [/\breal l'ancien fournisseur checkout\b/g, 'real provider checkout'],
  [/\braw bytes l'ancien fournisseur\b/g, 'raw bytes the payment provider']
];

/* ⛔ Identifiants de DONNÉES : jamais réécrits, même dans un commentaire.
   Ce sont des champs qui EXISTENT en base : un commentaire qui les explique
   doit continuer à les nommer, sinon il ment sur la donnée réelle. */
const GARDER = /^(stripeFeeRendu|frais_stripe|stripeSessionId|stripe_events|stripeFeeCents|stripePct|stripeFix|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|ETATS_STRIPE|GENRES_STRIPE)$/;

/* `esprima` ne connaît pas `for await (…)` — `api/webhook.js` lit le corps
   brut ainsi. On neutralise le mot-clé POUR L'ANALYSE SEULEMENT, par des
   espaces de MÊME LONGUEUR : les positions des commentaires restent
   rigoureusement identiques. Retirer le mot décalerait tout et couperait les
   commentaires au mauvais endroit. */
const pourAnalyse = (s) => s.replace(/for await \(/g, 'for       (');

function commentaires(src) {
  return esprima.parseScript(pourAnalyse(src),
    { comment: true, range: true, tolerant: true }).comments || [];
}

/* LE CŒUR DE LA PREUVE — le fichier privé de ses commentaires.
   Les plages viennent du parseur, jamais d'une expression régulière : une
   régulière ne sait pas distinguer `// ...` dans du code de `"// ..."` dans
   une chaîne, et c'est toute la question. */
function codeNu(src) {
  const cs = commentaires(src).slice().sort((a, b) => a.range[0] - b.range[0]);
  let out = '', pos = 0;
  for (const c of cs) { out += src.slice(pos, c.range[0]); pos = c.range[1]; }
  return out + src.slice(pos);
}

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

function jetons(src) {
  return JSON.stringify(esprima.tokenize(pourAnalyse(src), { range: false }));
}

/* Applique la table à UN commentaire, en mettant à l'abri les identifiants de
   données. Le sentinelle est un caractère que le code source ne contient
   jamais (U+0000), pour qu'aucun texte légitime ne puisse l'imiter. */
const S = '\u0000';
function reecrire(texte) {
  const mis = [];
  let t = texte.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (m) => {
    if (!GARDER.test(m)) return m;
    mis.push(m);
    return S + (mis.length - 1) + S;
  });
  for (const [re, rep] of REGLES) t = t.replace(re, rep);
  return t.replace(new RegExp(S + '(\\d+)' + S, 'g'), (_, i) => mis[Number(i)]);
}

const args = process.argv.slice(2);
const verifierSeulement = args.includes('--verifier');
const fichiers = args.filter((a) => !a.startsWith('--'));
if (!fichiers.length) {
  console.error('usage : node outils/purge-commentaires.mjs [--verifier] <fichier.js> [...]');
  process.exit(2);
}

let touches = 0, commentairesReecrits = 0, refuses = 0, ignores = 0;

for (const f of fichiers) {
  let src;
  try { src = await readFile(f, 'utf8'); } catch (_) { ignores++; continue; }

  let cs;
  try { cs = commentaires(src); }
  catch (e) {
    console.log('  IGNORE   ' + f + '  (non analysable : ' + e.message.slice(0, 50) + ')');
    ignores++; continue;
  }

  // Réécriture, de la FIN vers le DÉBUT : les plages non encore traitées
  // gardent ainsi leurs positions d'origine, sans décalage à entretenir.
  const tries = cs.slice().sort((a, b) => b.range[0] - a.range[0]);
  let out = src, n = 0;
  for (const c of tries) {
    const neuf = reecrire(c.value);
    if (neuf === c.value) continue;
    const rendu = c.type === 'Line' ? '//' + neuf : '/*' + neuf + '*/';
    out = out.slice(0, c.range[0]) + rendu + out.slice(c.range[1]);
    n++;
  }
  if (!n) continue;

  /* ═══ PREUVE ① — le code nu doit être identique à l'octet près ═══════════
     Les commentaires du RÉSULTAT sont retrouvés par un parse indépendant :
     leur longueur a changé, donc leurs positions aussi. Réutiliser les plages
     d'avant donnerait une comparaison qui ne veut rien dire. */
  let nuAvant, nuApres;
  try { nuAvant = codeNu(src); nuApres = codeNu(out); }
  catch (e) {
    console.log('  REFUSE   ' + f + '  (le résultat ne se parse plus : ' + e.message.slice(0, 50) + ')');
    refuses++; continue;
  }
  if (sha(nuAvant) !== sha(nuApres)) {
    console.log('  REFUSE   ' + f + '  ⛔ LE CODE A CHANGÉ — non écrit');
    // On montre où, sinon « ça a changé » n'aide personne à corriger.
    let i = 0;
    while (i < nuAvant.length && i < nuApres.length && nuAvant[i] === nuApres[i]) i++;
    console.log('           1re divergence à l\'octet ' + i);
    console.log('           avant : ' + JSON.stringify(nuAvant.slice(Math.max(0, i - 30), i + 30)));
    console.log('           apres : ' + JSON.stringify(nuApres.slice(Math.max(0, i - 30), i + 30)));
    refuses++; continue;
  }

  /* ═══ PREUVE ② — le flux de jetons doit être identique ═══════════════════
     Indépendante de la première : elle ne compare pas des octets mais ce que
     le moteur JavaScript lit. Un défaut qui tromperait les deux devrait être
     très particulier. */
  let jAvant, jApres;
  try { jAvant = jetons(src); jApres = jetons(out); }
  catch (e) {
    console.log('  REFUSE   ' + f + '  (jetons illisibles : ' + e.message.slice(0, 50) + ')');
    refuses++; continue;
  }
  if (jAvant !== jApres) {
    console.log('  REFUSE   ' + f + '  ⛔ LE FLUX DE JETONS A CHANGÉ — non écrit');
    refuses++; continue;
  }

  const court = f.replace(RACINE + '/', '');
  if (verifierSeulement) {
    console.log('  vu       ' + court + '  (' + n + ' commentaire(s), code prouvé identique)');
  } else {
    await writeFile(f, out);
    console.log('  ok       ' + court + '  (' + n + ' commentaire(s), code prouvé identique)');
  }
  touches++; commentairesReecrits += n;
}

console.log('');
console.log((verifierSeulement ? 'VÉRIFICATION — rien écrit. ' : '')
  + touches + ' fichier(s) · ' + commentairesReecrits + ' commentaire(s) · '
  + refuses + ' refus · ' + ignores + ' ignoré(s)');
process.exitCode = refuses ? 1 : 0;
