/* outils/purge-stripe.mjs — RETIRER UN NOM DES COMMENTAIRES, SANS TOUCHER AU CODE.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE

   Le 01/08/2026, l'user a demandé que le nom de l'ancien encaisseur disparaisse
   PARTOUT. J'ai tenté un remplacement de texte en masse. Résultat :

     · `'l\'ancien fournisseur'` inséré au milieu d'une chaîne à apostrophes
       simples → fichier qui ne se parse plus ;
     · un nom de domaine muté en phrase française dans deux en-têtes ;
     · et surtout : la CI est restée VERTE, parce que le chargeur avalait le
       module cassé en silence.

   Tout a dû être annulé. La cause est bête et générale : **un remplacement de
   texte ne distingue pas un commentaire d'une chaîne de caractères.**

   ─────────────────────────────────────────────────────────────────────────
   CE QUE FAIT CET OUTIL, ET CE QU'IL REFUSE

   ① Il ANALYSE le fichier avec `esprima` — déjà présent — et n'obtient que
      les COMMENTAIRES, avec leurs positions exactes. Le code exécutable n'est
      jamais touché : ni chaîne, ni identifiant, ni nom de fichier.
   ② Il protège les IDENTIFIANTS DE DONNÉES même à l'intérieur d'un
      commentaire : `stripeFeeRendu`, `frais_stripe`, `stripe_events`… sont des
      champs qui EXISTENT encore en base. Un commentaire qui les explique doit
      continuer à les nommer, sinon il ment.
   ③ Il REPARSE le résultat avant d'écrire. Si la réécriture casse la syntaxe,
      le fichier n'est pas écrit et l'outil le DIT.

   USAGE
     node outils/purge-stripe.mjs <fichier.js> [fichier.js …]
   ───────────────────────────────────────────────────────────────────────── */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { RACINE } from '../tests/_socle.mjs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const esprima = require(join(RACINE, 'node_modules', 'esprima'));

const MOTS = [
  [/\bStripe Connect\b/g, 'virement direct'],
  [/\bStripe Elements\b/g, 'le champ carte'],
  [/\bStripe Checkout\b/g, 'la page de paiement hebergee'],
  [/js\.stripe\.com/g, 'le SDK de l ancien fournisseur'],
  [/api\.stripe\.com/g, 'l API de l ancien fournisseur'],
  [/\bstripe\.com\b/g, 'le site de l ancien fournisseur'],
  [/\bStripe\b/g, 'l ancien fournisseur'],
  [/\bSTRIPE\b/g, 'L ANCIEN FOURNISSEUR'],
  [/\bstripe\b/g, 'l ancien fournisseur']
];

/* ⛔ Identifiants de DONNÉES : jamais réécrits, même dans un commentaire. Le
   commentaire décrit un champ qui existe toujours en base ; le renommer là
   ferait mentir la documentation sur la donnée réelle. */
const GARDER = /^(stripeFeeRendu|frais_stripe|stripeSessionId|stripe_events|stripeFeeCents|stripePct|stripeFix|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|ETATS_STRIPE|GENRES_STRIPE)$/;

const fichiers = process.argv.slice(2);
if (!fichiers.length) {
  console.error('usage : node outils/purge-stripe.mjs <fichier.js> [...]');
  process.exit(2);
}

let total = 0, touches = 0, refuses = 0;
for (const f of fichiers) {
  let src;
  try { src = await readFile(f, 'utf8'); } catch (_) { continue; }
  /* ⚠️ `esprima` ne connaît pas `for await (…)` — `api/webhook.js` lit le corps
     brut de la requête ainsi. On neutralise le mot-clé POUR L'ANALYSE
     SEULEMENT, par des espaces de MÊME LONGUEUR : les positions des
     commentaires restent rigoureusement identiques, et c'est la source
     d'origine qu'on réécrit ensuite. Retirer le mot décalerait tout et
     couperait les commentaires au mauvais endroit. */
  const pourAnalyse = src.replace(/for await \(/g, 'for       (');
  let comments;
  try {
    comments = esprima.parseScript(pourAnalyse, { comment: true, range: true, tolerant: true }).comments || [];
  } catch (e) {
    console.log('  warn  ' + f + ' : non analysable, ignore  (' + e.message.slice(0, 40) + ')');
    continue;
  }
  let out = src, decal = 0, n = 0;
  for (const c of comments) {
    const orig = c.value;
    const jetons = [];
    let txt = orig.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (m) => {
      if (GARDER.test(m)) { jetons.push(m); return '' + (jetons.length - 1) + ''; }
      return m;
    });
    for (const [re, rep] of MOTS) txt = txt.replace(re, rep);
    txt = txt.replace(/(\d+)/g, (_, i) => jetons[Number(i)]);
    if (txt === orig) continue;
    const a = c.range[0] + decal, b = c.range[1] + decal;
    const apres = (c.type === 'Line' ? '//' : '/*') + txt + (c.type === 'Line' ? '' : '*/');
    const avantLen = b - a;
    out = out.slice(0, a) + apres + out.slice(b);
    decal += apres.length - avantLen;
    n++;
  }
  if (!n) continue;
  /* ⛔ GARDE-FOU : on reparse AVANT d'écrire. C'est exactement ce qui manquait
     au tour précédent — le fichier cassé était parti sur le disque. */
  try { esprima.parseScript(out.replace(/for await \(/g, 'for       ('), { tolerant: true }); }
  catch (e) {
    console.log('  REFUSE  ' + f + ' : la reecriture casse la syntaxe, non ecrit');
    refuses++;
    continue;
  }
  await writeFile(f, out);
  console.log('  ok  ' + f.replace(RACINE + '/', '') + '  (' + n + ' commentaires)');
  total += n; touches++;
}
console.log('');
console.log(touches + ' fichier(s) reecrit(s), ' + total + ' commentaire(s), ' + refuses + ' refus');
