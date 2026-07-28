/* tests/_porter.mjs — rend un harnais PORTABLE, mécaniquement.
   ─────────────────────────────────────────────────────────────────────────
   Les 60 harnais sauvés du scratchpad contiennent des chemins absolus qui ne
   valent QUE dans le conteneur où ils ont été écrits. Les réécrire à la main
   soixante fois, c'est soixante occasions de se tromper. Ce script fait la
   réécriture MÉCANIQUEMENT, et signale tout chemin absolu qu'il n'a pas su
   traiter — plutôt que de le laisser passer en silence.

   Usage :  node tests/_porter.mjs <fichier…>        (réécrit dans tests/)
            node tests/_porter.mjs --controle <f…>   (dit seulement ce qui reste)
   ───────────────────────────────────────────────────────────────────────── */
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS = dirname(fileURLToPath(import.meta.url));

const REECRITURES = [
  // 1. Playwright : plus de chemin en dur, on passe par le socle.
  [/^import pkg from '\/opt\/node22\/lib\/node_modules\/playwright\/index\.js';?$/m,
   "import { playwright } from './_socle.mjs';\nconst pkg = await playwright();"],
  [/^import \{ chromium \} from '\/opt\/node22\/lib\/node_modules\/playwright\/index\.js';?$/m,
   "import { playwright } from './_socle.mjs';\nconst { chromium } = await playwright();"],

  // 2. La racine du dépôt : calculée, jamais écrite.
  [/const ROOT\s*=\s*'\/home\/user\/ish\/pirates-tools'/g, "const ROOT = RACINE"],

  // 3. Le binaire du navigateur : résolu s'il existe, ignoré sinon.
  [/executablePath\s*:\s*'\/opt\/pw-browsers\/chromium'\s*,?/g, ''],

  // 4. Les sorties temporaires : dans tests/_sortie, jamais dans /tmp.
  [/const OUT\s*=\s*'\/tmp\/claude-0\/[^']*'/g, "const OUT = await sortie(basename(import.meta.url))"],
  [/'\/tmp\/claude-0\/[^']*\/scratchpad\/([^']*)'/g, "join(await sortie('captures'), '$1')"]
];

const RESTE_ABSOLU = /['"`](\/(?:home|opt|tmp|usr|var)\/[^'"`]*)['"`]/g;

export async function porter(chemin, { controle = false } = {}) {
  const src = await readFile(chemin, 'utf8');
  let s = src;

  /* ⚠️ DÉFAUT RÉEL, CORRIGÉ LE 28/07 : une première version injectait des
     `import` ESM dans des fichiers CommonJS. Node 22 détecte la syntaxe ESM et
     bascule le fichier en module — leurs `require()` échouaient alors avec
     « require is not defined in ES module scope ». 12 harnais ont été cassés
     ainsi, et le lanceur l'a montré (« a planté avant de tester »).
     On détecte donc le dialecte AVANT de toucher au fichier. */
  const estCJS = /(^|\n)\s*(const|let|var)[^\n]*\brequire\s*\(/.test(src)
    && !/^\s*import\s/m.test(src);
  for (const [de, vers] of REECRITURES) s = s.replace(de, vers);

  // Les imports du socle dont le fichier a désormais besoin,
  // dans le DIALECTE du fichier — jamais l'autre.
  const besoins = [];
  if (/\bRACINE\b/.test(s) && !/from '\.\/_socle\.mjs'/.test(s)) besoins.push('RACINE');
  if (/\bsortie\(/.test(s)) besoins.push('sortie');
  if (besoins.length) {
    const ligne = estCJS
      ? "const { " + besoins.join(', ') + " } = require('./_socle.cjs');"
      : "import { " + besoins.join(', ') + " } from './_socle.mjs';";
    s = /^import /m.test(s) ? s.replace(/^(import .*)$/m, ligne + '\n$1') : ligne + '\n' + s;
  }
  if (/\bRACINE\b/.test(s) && /from '\.\/_socle\.mjs'/.test(s) && !/\{[^}]*RACINE[^}]*\} from '\.\/_socle\.mjs'/.test(s)) {
    s = s.replace(/import \{ ([^}]*) \} from '\.\/_socle\.mjs';/, "import { $1, RACINE } from './_socle.mjs';");
  }
  if (/\bjoin\(/.test(s) && !/from 'node:path'/.test(s) && !/require\('path'\)/.test(s)) {
    s = (estCJS ? "const { join, basename } = require('path');\n"
                : "import { join, basename } from 'node:path';\n") + s;
  }

  const restants = [...s.matchAll(RESTE_ABSOLU)].map((m) => m[1]);
  const nom = basename(chemin);

  if (!controle) {
    await writeFile(join(TESTS, nom), s, 'utf8');
  }
  return { nom, modifie: s !== src, restants: [...new Set(restants)] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const controle = args.includes('--controle');
  const fichiers = args.filter((a) => !a.startsWith('--'));
  let porte = 0, bloques = 0;
  for (const f of fichiers) {
    const r = await porter(resolve(f), { controle });
    if (r.restants.length) {
      bloques++;
      console.log('⚠️  ' + r.nom + ' — chemin(s) absolu(s) NON traité(s) :');
      r.restants.forEach((x) => console.log('      ' + x));
    } else {
      porte++;
      console.log('✅ ' + r.nom + (controle ? ' (contrôle)' : ' → tests/'));
    }
  }
  console.log('\n' + porte + ' portable(s), ' + bloques + ' à reprendre à la main.');
  process.exitCode = bloques ? 1 : 0;
}
