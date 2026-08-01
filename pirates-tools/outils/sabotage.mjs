/* outils/sabotage.mjs — PROUVER QU'UN CONTRÔLE MORD, SANS POUVOIR SE MENTIR.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE

   La règle mère du projet dit : « une vérification qu'on ne parvient pas à
   faire échouer ne vérifie rien ». On saborde donc chaque contrôle neuf pour
   le prouver faillible.

   Le 01/08/2026, TROIS de ces sabotages ont menti — dans la même session :

     ① un `perl -0pi -e "s/^…/…/m"` dont l'ancre n'a jamais accroché : le
        fichier n'a PAS été modifié. Le contrôle est resté vert, et j'ai
        annoncé « la garde a mordu ». Elle n'avait rien eu à mordre.
     ② une copie de l'outil lancée depuis un autre dossier : elle est morte
        sur `ERR_MODULE_NOT_FOUND` avant la première ligne utile. La sortie ne
        contenait aucun « ❌ », donc mon grep a conclu « vert ».
     ③ un relevé de référence lancé sur `tests/x.mjs` alors que le fichier
        s'appelle `tests/x.js` : `MODULE_NOT_FOUND`, lu comme « vert ».

   ⛔ LE MÉCANISME COMMUN, ET IL EST GRAVE : **j'ai confondu « la commande n'a
   rien dit » avec « la commande a réussi »**. Le projet connaît pourtant la
   règle — « non exécuté n'est PAS vert » — mais elle n'était écrite que pour
   les harnais, jamais pour mes propres commandes de vérification.

   Un sabotage qui ne s'applique pas, ou une commande qui ne s'exécute pas,
   produisent le MÊME signal qu'un succès : rien. Cet outil rend ce silence
   impossible à confondre.

   ─────────────────────────────────────────────────────────────────────────
   CE QU'IL REFUSE, ET C'EST TOUT L'INTÉRÊT

   ① Il REFUSE de conclure si la substitution n'a rien changé.
      Empreinte avant / après. Identiques ⇒ « SABOTAGE NON APPLIQUÉ », code 2.
      On ne saura jamais si le contrôle mord : la mesure n'a pas eu lieu.
   ② Il REFUSE de conclure si la commande ne s'est pas vraiment exécutée.
      `MODULE_NOT_FOUND`, `command not found`, `ENOENT`, code 127 : ce sont
      des pannes de LANCEMENT, pas des résultats.
   ③ Il RESTAURE toujours le fichier, y compris s'il plante — puis il vérifie
      la restauration par empreinte. Un dépôt laissé sabordé est pire que pas
      de sabotage du tout.
   ④ Il dit ce qu'il ATTENDAIT. Par défaut : le contrôle doit devenir ROUGE.
      Un sabotage qui laisse tout vert est un ÉCHEC de la porte, et l'outil
      le dit en ces termes — pas « ok ».

   ─────────────────────────────────────────────────────────────────────────
   USAGE

     node outils/sabotage.mjs \
       --fichier app.js \
       --cherche "if (!window.confirm(" \
       --remplace "if (false && !window.confirm(" \
       --commande "node tests/raz-deux-clics.mjs"

   Options
     --regex            `--cherche` est une expression régulière (drapeau g)
     --attendu vert     on attend que le contrôle RESTE vert (rare, à motiver)
     --motif-echec "…"  motif qui signale l'échec (défaut : ❌ ou FAIL)
   ───────────────────────────────────────────────────────────────────────── */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { RACINE } from '../tests/_socle.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex');

function opt(nom, defaut) {
  const i = process.argv.indexOf('--' + nom);
  return i === -1 ? defaut : process.argv[i + 1];
}
const drapeau = (nom) => process.argv.includes('--' + nom);

const fichier = opt('fichier');
const cherche = opt('cherche');
const remplace = opt('remplace', '');
const commande = opt('commande');
const attendu = opt('attendu', 'rouge');
const motifEchec = new RegExp(opt('motif-echec', '❌|FAIL|\\bKO\\b'));

if (!fichier || cherche === undefined || !commande) {
  console.error('usage : node outils/sabotage.mjs --fichier <f> --cherche <s> '
    + '--remplace <s> --commande "<cmd>" [--regex] [--attendu vert]');
  process.exit(2);
}

/* ⛔ Signes qu'une commande n'a PAS TOURNÉ. Ce ne sont pas des résultats de
   test : ce sont des pannes de lancement. Les confondre est exactement la
   faute que cet outil existe pour empêcher.

   ⚠️ RESSERRÉ le 01/08/2026, après une fausse alerte de l'outil lui-même :
   il cherchait « Cannot find module » N'IMPORTE OÙ dans la sortie. Or une
   commande qui TOURNE parfaitement peut imprimer ce texte — c'est ce que fait
   la CI quand elle signale une de ses portes cassées. L'outil annonçait donc
   « commande non exécutée » sur une exécution réussie : un détecteur qui crie
   à tort vaut à peine mieux qu'un détecteur muet.
   On ne retient plus que ce qui prouve un ÉCHEC DE LANCEMENT :
     · le module introuvable est LE SCRIPT LUI-MÊME (première ligne) ;
     · l'interpréteur ou la commande n'existe pas (code 127, ENOENT). */
function lancementRate(sortie, code, cmd) {
  if (code === 127) return 'code 127 — commande introuvable';
  if (/^\s*(?:\/bin\/sh|bash)?:?\s*[^\n]*command not found/m.test(sortie)) return 'command not found';
  // « Cannot find module 'X' » où X est le fichier qu'on voulait lancer.
  const m = sortie.match(/Cannot find module '([^']+)'/);
  if (m) {
    const vise = m[1].replace(/^.*\//, '');
    const dansLaCommande = cmd.split(/\s+/).some((tok) => tok.replace(/^.*\//, '') === vise);
    if (dansLaCommande) return "le script visé est introuvable : " + m[1];
  }
  return null;
}

const origine = await readFile(fichier, 'utf8');
const empreinteOrigine = sha(origine);

/* Restauration SYNCHRONE : elle doit passer même dans un `finally` qu'on
   traverse en urgence. (`require` n'existe pas en module ES — on importe.) */
const fs = await import('node:fs');
function remettre() { fs.writeFileSync(fichier, origine); }

let sortie = '', code = 0, verdict = '';
try {
  // ── ① APPLIQUER, puis PROUVER que ça a été appliqué ────────────────────
  const motif = drapeau('regex') ? new RegExp(cherche, 'g') : cherche;
  const sabote = drapeau('regex')
    ? origine.replace(motif, remplace)
    : origine.split(cherche).join(remplace);

  if (sha(sabote) === empreinteOrigine) {
    console.error('⛔ SABOTAGE NON APPLIQUÉ — le motif ne se trouve pas dans le fichier.');
    console.error('   fichier : ' + fichier);
    console.error('   cherché : ' + JSON.stringify(cherche));
    console.error('   ⚠️ La mesure N\'A PAS EU LIEU. Ne rien conclure : un contrôle');
    console.error('      resté vert ici ne prouve RIEN, il n\'a rien eu à attraper.');
    process.exit(2);
  }
  const combien = drapeau('regex')
    ? (origine.match(motif) || []).length
    : origine.split(cherche).length - 1;
  await writeFile(fichier, sabote);
  console.log('· sabotage appliqué — ' + combien + ' occurrence(s) dans ' + fichier);

  // ── ② EXÉCUTER, puis PROUVER que ça a tourné ───────────────────────────
  try {
    sortie = execSync(commande, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    code = typeof e.status === 'number' ? e.status : 1;
    sortie = String(e.stdout || '') + String(e.stderr || '');
  }

  var rate = lancementRate(sortie, code, commande);
  if (rate) {
    console.error('⛔ COMMANDE NON EXÉCUTÉE — elle est morte avant de tester quoi que ce soit.');
    console.error('   commande : ' + commande);
    console.error('   indice   : ' + rate);
    console.error('   ⚠️ Fichier introuvable ? mauvaise extension ? mauvais dossier ?');
    console.error('      Ce n\'est PAS un résultat. Non exécuté n\'est pas vert.');
    verdict = 'NON_EXECUTEE';
  } else {
    const rouge = code !== 0 || motifEchec.test(sortie);
    verdict = rouge ? 'rouge' : 'vert';
    console.log('· commande exécutée — code ' + code + ', contrôle ' + verdict);
  }
} finally {
  // ── ③ RESTAURER, puis PROUVER la restauration ──────────────────────────
  remettre();
  const relu = fs.readFileSync(fichier, 'utf8');
  if (sha(relu) !== empreinteOrigine) {
    console.error('🚨 RESTAURATION ÉCHOUÉE sur ' + fichier + ' — LE DÉPÔT EST SABORDÉ.');
    console.error('   Restaure-le à la main avant toute autre chose : git checkout -- ' + fichier);
    process.exit(3);
  }
  console.log('· fichier restauré, empreinte vérifiée');
}

if (verdict === 'NON_EXECUTEE') process.exit(2);

// ── ④ CONCLURE, en disant ce qu'on attendait ─────────────────────────────
if (verdict === attendu) {
  console.log((attendu === 'rouge'
    ? '✅ LA PORTE MORD — sabotage réel, contrôle devenu rouge.'
    : '✅ contrôle resté vert, comme attendu.'));
  process.exit(0);
}
console.error(attendu === 'rouge'
  ? '❌ LA PORTE NE MORD PAS — le sabotage est bien passé, et le contrôle reste VERT.\n'
    + '   C\'est une porte qui rassure sans rien garantir : pire que pas de porte.'
  : '❌ le contrôle est devenu rouge alors qu\'on l\'attendait vert.');
console.error('── sortie de la commande (30 dernières lignes) ──');
console.error(sortie.split('\n').slice(-30).join('\n'));
process.exit(1);
