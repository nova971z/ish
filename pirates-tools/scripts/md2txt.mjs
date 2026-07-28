// md2txt.mjs — rend un .md lisible en TEXTE BRUT sur iPad.
// Les tableaux Markdown sont illisibles avec un retour à la ligne automatique :
// chaque ligne de tableau devient donc un BLOC étiqueté.
import { readFileSync, writeFileSync } from 'node:fs';

const L = 78; // largeur de lecture confortable
const src = readFileSync(process.argv[2], 'utf8').split('\n');
const out = [];

function wrap(txt, indent = '') {
  const mots = txt.split(/\s+/).filter(Boolean);
  const lignes = [];
  let cur = indent;
  for (const m of mots) {
    if (cur.length + m.length + 1 > L && cur.trim()) { lignes.push(cur.replace(/\s+$/, '')); cur = indent; }
    cur += (cur === indent ? '' : ' ') + m;
  }
  if (cur.trim()) lignes.push(cur.replace(/\s+$/, ''));
  return lignes;
}

// retire le balisage qui ne veut rien dire en texte brut
function net(s) {
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 <$2>')   // liens -> texte <url>
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s?/, '| ')
    .trim();
}

let i = 0, dansCode = false;
while (i < src.length) {
  const l = src[i];

  if (/^```/.test(l)) { dansCode = !dansCode; out.push(dansCode ? '    ┌─────' : '    └─────'); i++; continue; }
  if (dansCode) { out.push('    │ ' + l); i++; continue; }

  // ─── tableau ───────────────────────────────────────────────────────────
  if (/^\|/.test(l) && /^\|[\s:|-]+\|?$/.test(src[i + 1] || '')) {
    const entetes = l.split('|').slice(1, -1).map((c) => net(c));
    i += 2;
    let n = 0;
    while (i < src.length && /^\|/.test(src[i])) {
      const cells = src[i].split('|').slice(1, -1).map((c) => net(c));
      n++;
      out.push('');
      out.push('  ── ' + (cells[0] || '(' + n + ')') + ' ' + '─'.repeat(Math.max(2, L - 6 - (cells[0] || '').length)));
      for (let k = 1; k < cells.length; k++) {
        if (!cells[k]) continue;
        const et = (entetes[k] || '').trim();
        wrap((et ? et + ' : ' : '') + cells[k], '     ').forEach((x, j) => out.push(j === 0 ? '  ' + x.trim().padStart(0) : x));
      }
      i++;
    }
    out.push('');
    continue;
  }

  // ─── titres ────────────────────────────────────────────────────────────
  let m;
  if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
    const t = net(m[2]);
    out.push('');
    if (m[1].length === 1) { out.push('='.repeat(L)); out.push(t.toUpperCase()); out.push('='.repeat(L)); }
    else if (m[1].length === 2) { out.push(t); out.push('─'.repeat(Math.min(L, t.length + 4))); }
    else { out.push('• ' + t); }
    out.push('');
    i++; continue;
  }

  if (/^---+$/.test(l.trim())) { out.push(''); out.push('·'.repeat(L)); out.push(''); i++; continue; }
  if (!l.trim()) { out.push(''); i++; continue; }

  // ─── listes ────────────────────────────────────────────────────────────
  if ((m = l.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/))) {
    const ind = ' '.repeat(m[1].length);
    const puce = /\d/.test(m[2]) ? m[2] : '-';
    wrap(net(m[3]), ind + ' '.repeat(puce.length + 1)).forEach((x, j) =>
      out.push(j === 0 ? ind + puce + ' ' + x.trim() : x));
    i++; continue;
  }

  wrap(net(l)).forEach((x) => out.push(x));
  i++;
}

writeFileSync(process.argv[3], out.join('\n').replace(/\n{4,}/g, '\n\n\n') + '\n', 'utf8');
console.log('écrit :', process.argv[3], '—', out.length, 'lignes');
