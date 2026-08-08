// Vérifie chaque constat candidat : l'extrait DOIT exister à la ligne annoncée (±3).
'use strict';
const fs = require('fs');
const path = require('path');
const RACINE = path.join(__dirname, '..', 'pirates-tools');
const dese = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const src = {};
function lignes(f) {
  if (!src[f]) src[f] = fs.readFileSync(path.join(RACINE, f), 'utf8').split('\n');
  return src[f];
}
const [fichierCand, fichierOk, fichierKo] = process.argv.slice(2);
const cand = fs.readFileSync(fichierCand, 'utf8').trim().split('\n');
const ok = [], ko = [];
for (const c of cand) {
  let j; try { j = JSON.parse(c); } catch (e) { continue; }
  if (!j.f || !j.l || !j.ex) continue;
  let L;
  try { L = lignes(j.f); } catch (e) { ko.push({ ...j, _pourquoi: 'fichier illisible' }); continue; }
  const ex = dese(j.ex).trim();
  let trouve = -1;
  for (let d = 0; d <= 3 && trouve < 0; d++) {
    for (const cible of d === 0 ? [j.l] : [j.l - d, j.l + d]) {
      const t = L[cible - 1];
      if (t && t.includes(ex)) { trouve = cible; break; }
    }
  }
  if (trouve > 0) { j.l = trouve; ok.push(j); }
  else ko.push({ ...j, _pourquoi: 'extrait introuvable à ±3 lignes' });
}
fs.writeFileSync(fichierOk, ok.map(x => JSON.stringify(x)).join('\n') + '\n');
fs.writeFileSync(fichierKo, ko.map(x => JSON.stringify(x)).join('\n') + '\n');
console.log('vérifiés :', ok.length, '· disqualifiés :', ko.length);
