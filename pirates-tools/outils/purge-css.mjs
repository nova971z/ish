/* outils/purge-css.mjs — SORTIR LES COMMENTAIRES DU CSS SERVI, SANS LES PERDRE.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE

   Demandé par l'user le 01/08/2026 : « tu vas virer les commentaires qui ne
   servent à rien dans le CSS et qui l'alourdissent pour rien ».

   MESURÉ avant d'agir, sur `styles.css` (283 809 octets bruts, 382 blocs) :

     · état actuel ................... 64 197 octets gzip
     · sans les 93 blocs de prose .... 50 810  (gain 13 387)
     · sans AUCUN commentaire ........ 43 439  (gain 20 758)

   La carte du fichier — les 289 repères d'une seule ligne, du genre
   « Couleurs » ou « 01) THÈME » — coûte donc 7 371 octets gzip à elle seule.
   Elle sert à NAVIGUER dans 283 Ko, pas à faire joli : on ne la jette pas, on
   la DÉPLACE dans `docs/CSS-CARTE.md`, qui n'est jamais servi. Rien n'est
   perdu, tout est repayé.

   ⚠️ Pourquoi ce budget compte ici plus qu'ailleurs : l'user navigue en
   navigation privée exclusivement. Aucun cache ne survit entre deux visites —
   chaque octet est retéléchargé à CHAQUE fois, par lui et par ses clients.

   ─────────────────────────────────────────────────────────────────────────
   CE QUE L'OUTIL GARANTIT

   ① Aucune règle CSS n'est touchée. Seuls les blocs de commentaire partent.
      Vérifié : la liste des DÉCLARATIONS (`propriété: valeur`) doit être
      identique avant et après, sinon l'outil refuse d'écrire.
   ② Chaque commentaire retiré est écrit dans `docs/CSS-CARTE.md`, rattaché au
      SÉLECTEUR qu'il documentait — jamais à un numéro de ligne, qui se périme
      (règle de la mémoire projet).
   ③ Rien n'est écrit tant que les deux points ci-dessus ne sont pas vrais.

   USAGE
     node outils/purge-css.mjs --essai     (mesure, n'écrit rien)
     node outils/purge-css.mjs             (écrit)
   ───────────────────────────────────────────────────────────────────────── */
import { RACINE } from '../tests/_socle.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const essai = process.argv.includes('--essai');
const CSS = join(RACINE, 'styles.css');
const CARTE = join(RACINE, 'docs', 'CSS-CARTE.md');

const source = await readFile(CSS, 'utf8');

/* ── Déclarations : l'invariant qu'on ne doit PAS casser ──────────────────
   On compare la suite des `propriété: valeur` avant/après. Si l'outil mangeait
   une accolade ou une règle, cette liste changerait — et on le verrait. */
function declarations(css) {
  return (css.replace(/\/\*[\s\S]*?\*\//g, '')
    .match(/[-a-zA-Z]+\s*:\s*[^;{}]+/g) || [])
    .map((d) => d.replace(/\s+/g, ' ').trim());
}

/* ── Le sélecteur qu'un commentaire documente ────────────────────────────
   C'est ce qui SUIT le commentaire : la première règle ou at-rule après lui.
   On coupe au premier `{` — le sélecteur seul suffit à le retrouver. */
function selecteurApres(css, index) {
  const suite = css.slice(index, index + 400).replace(/\/\*[\s\S]*?\*\//g, '');
  const m = suite.match(/(@[a-z-]+[^;{]*|[^{};]+)\{/);
  if (!m) return '(fin de fichier)';
  return m[1].replace(/\s+/g, ' ').trim().slice(0, 120);
}

const blocs = [];
const re = /\/\*[\s\S]*?\*\//g;
let m;
while ((m = re.exec(source))) {
  blocs.push({
    texte: m[0],
    fin: m.index + m[0].length,
    multiligne: m[0].indexOf('\n') !== -1
  });
}

/* Retrait, puis nettoyage des lignes devenues vides et des espaces de fin. */
const purge = source
  .replace(re, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .replace(/^\n+/, '');

/* ── GARDE-FOU ① : les déclarations sont-elles intactes ? ─────────────── */
const avant = declarations(source);
const apres = declarations(purge);
const identiques = avant.length === apres.length
  && avant.every((d, i) => d === apres[i]);

/* ── La carte : tout ce qu'on retire, rattaché à son sélecteur ────────── */
const lignes = [
  '# CARTE DU CSS — tous les commentaires retirés de `styles.css`',
  '',
  '> ⛔ **Ce fichier n\'est JAMAIS servi.** Il existe parce que les commentaires',
  '> de `styles.css` coûtaient **20 758 octets gzip** à chaque visite — et',
  '> l\'user navigue en privé, donc aucun cache ne les amortit : ils étaient',
  '> retéléchargés à chaque fois, par lui et par ses clients.',
  '>',
  '> Rien n\'a été perdu : chaque commentaire est ici, rattaché au **sélecteur**',
  '> qu\'il documentait — jamais à un numéro de ligne, qui se périme.',
  '>',
  '> Régénéré par `node outils/purge-css.mjs`.',
  '',
  '---',
  ''
];
blocs.forEach((b) => {
  const sel = selecteurApres(source, b.fin);
  const corps = b.texte
    .replace(/^\/\*+/, '').replace(/\*+\/$/, '')
    .split('\n').map((l) => l.replace(/^\s*\*?\s?/, '').trimEnd())
    .join('\n').trim();
  if (!corps) return;
  lignes.push('### `' + sel + '`');
  lignes.push('');
  lignes.push(corps.split('\n').map((l) => (l ? l : '')).join('\n'));
  lignes.push('');
});
const carte = lignes.join('\n');

const g = (s) => gzipSync(Buffer.from(s)).length;
console.log('styles.css   brut  : ' + source.length + ' → ' + purge.length + ' octets');
console.log('styles.css   gzip  : ' + g(source) + ' → ' + g(purge)
  + '  (gain ' + (g(source) - g(purge)) + ' octets)');
console.log('blocs retirés      : ' + blocs.length
  + '  (' + blocs.filter((b) => b.multiligne).length + ' multilignes)');
console.log('déclarations CSS   : ' + avant.length + ' avant, ' + apres.length + ' après → '
  + (identiques ? '✅ IDENTIQUES' : '⛔ DIVERGENTES'));

if (!identiques) {
  console.error('');
  console.error('⛔ REFUS D\'ÉCRIRE : le retrait a modifié les déclarations CSS.');
  const i = avant.findIndex((d, k) => d !== apres[k]);
  console.error('   1re divergence à l\'index ' + i + ' :');
  console.error('   avant : ' + avant[i]);
  console.error('   après : ' + apres[i]);
  process.exit(1);
}

if (essai) { console.log('\n(--essai : rien n\'a été écrit)'); process.exit(0); }

await writeFile(CARTE, carte);
await writeFile(CSS, purge);
console.log('\nécrit : styles.css  et  docs/CSS-CARTE.md (' + carte.length + ' octets)');
