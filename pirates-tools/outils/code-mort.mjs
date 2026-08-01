/* outils/code-mort.mjs — CE QUI EST SERVI ET NE SERT À RIEN.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CET OUTIL EXISTE

   Demandé par l'user le 01/08/2026 : « fais un gros tour de vérification pour
   chercher du code mort ou qui ne sert plus à rien, car s'il y en a ça va
   alourdir le site pour absolument rien ».

   Il navigue en privé : aucun cache ne survit entre deux visites. Chaque octet
   mort est donc retéléchargé à CHAQUE fois, par lui et par ses clients.

   ─────────────────────────────────────────────────────────────────────────
   ⛔ LE PIÈGE QUI TUE CE GENRE D'OUTIL

   Les classes CSS construites par CONCATÉNATION n'apparaissent nulle part en
   toutes lettres : `'toast--' + type`, `page-*`, `abo-page--*`,
   `plan-detail--*`, `partner-card--*`, `stock-badge--*`, `lv-tarif--z*`,
   `admin-app--*`, et `leaflet-container` que pose une bibliothèque tierce.
   Elles SEMBLENT mortes et ne le sont pas. Les supprimer casse l'affichage
   sans qu'aucun test ne rougisse — la règle du projet le dit déjà, en toutes
   lettres, parce que ça a coûté cher.

   Cet outil ne supprime donc RIEN. Il PROPOSE, avec pour chaque candidat le
   motif qui permet de trancher — et il écarte de lui-même tout ce qui pourrait
   être construit dynamiquement.

   ⚠️ Pour le JavaScript il utilise `esprima`, déjà présent dans le projet :
   on ne réécrit pas un analyseur syntaxique à la main — c'est faux à 95 %, et
   95 % suffit à casser.

   USAGE
     node outils/code-mort.mjs
   ───────────────────────────────────────────────────────────────────────── */
import { RACINE } from '../tests/_socle.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esprima = require('esprima');

const app = await readFile(join(RACINE, 'app.js'), 'utf8');
const html = await readFile(join(RACINE, 'index.html'), 'utf8');
const css = await readFile(join(RACINE, 'styles.css'), 'utf8');

/* ── 1. FONCTIONS JAMAIS APPELÉES ────────────────────────────────────────
   On déclare, on compte les usages du NOM ailleurs que dans sa déclaration.
   Un nom utilisé une seule fois = seulement sa définition = personne ne
   l'appelle. */
const ast = esprima.parseScript(app, { loc: true, tolerant: true });
const declarees = new Map();
(function marche(n) {
  if (!n || typeof n !== 'object') return;
  if ((n.type === 'FunctionDeclaration') && n.id && n.loc) {
    declarees.set(n.id.name, n.loc.end.line - n.loc.start.line + 1);
  }
  for (const k of Object.keys(n)) {
    const v = n[k];
    if (Array.isArray(v)) v.forEach(marche);
    else if (v && typeof v === 'object' && v.type) marche(v);
  }
})(ast);

/* ⛔ PIÈGE PAYÉ ICI MÊME, LE 01/08/2026. Cette boucle utilisait `\b` autour du
   nom — or `$` n'est PAS un caractère de mot : `\b$\b` ne matche jamais. Les
   deux raccourcis `$` et `$$` sont donc sortis « jamais appelés » alors qu'ils
   le sont à quatre endroits. Je les ai supprimés, et c'est la porte P1 du
   projet qui a rattrapé la faute — pas moi.
   On échappe donc le nom et on borne sur ce qui PEUT entourer un identifiant,
   au lieu de se fier à `\b`. */
const echappe = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const orphelines = [];
for (const [nom, lignes] of declarees) {
  const motif = new RegExp('(^|[^A-Za-z0-9_$])' + echappe(nom) + '(?![A-Za-z0-9_$])', 'g');
  const usages = (app.match(motif) || []).length;
  /* Un nom peut aussi être appelé depuis index.html (onclick=…) ou depuis un
     autre fichier servi : on regarde partout avant d'accuser. */
  const ailleurs = (html.match(new RegExp('(^|[^A-Za-z0-9_$])' + echappe(nom) + '(?![A-Za-z0-9_$])', 'g')) || []).length;
  if (usages <= 1 && ailleurs === 0) orphelines.push({ nom, lignes });
}
orphelines.sort((a, b) => b.lignes - a.lignes);

/* ── 2. RÈGLES CSS DONT AUCUN SÉLECTEUR N'EST ATTEIGNABLE ────────────────
   ⛔ On ÉCARTE tout ce qui pourrait être construit : si le préfixe avant `--`
   ou `-` apparaît dans une concaténation JS, on ne juge pas. */
const classesCss = new Set();
const reSel = /(^|[},])\s*([^{}@]+?)\s*\{/g;
let m;
while ((m = reSel.exec(css))) {
  (m[2].match(/\.[-_a-zA-Z0-9]+/g) || []).forEach((c) => classesCss.add(c.slice(1)));
}
const suspectes = [];
for (const c of classesCss) {
  const litteral = new RegExp('["\'\\s.]' + c.replace(/[-]/g, '\\-') + '["\'\\s,.:\\[]');
  if (litteral.test(html) || litteral.test(app)) continue;
  /* Construite dynamiquement ? On teste chaque préfixe possible. */
  let construite = false;
  for (let i = c.length - 1; i > 2; i--) {
    const pref = c.slice(0, i);
    if (app.indexOf("'" + pref) !== -1 || app.indexOf('"' + pref) !== -1
      || app.indexOf('`' + pref) !== -1) { construite = true; break; }
  }
  if (!construite) suspectes.push(c);
}

/* ── 3. IDENTIFIANTS HTML QUE PERSONNE NE LIT ────────────────────────────
   Un id sert soit au JS, soit à une ancre, soit à un `for=` / `aria-*`. */
/* ⚠️ 1ʳᵉ VERSION FAUSSE, corrigée sur-le-champ : elle annonçait 36 identifiants
   morts dont AUCUN ne l'était. Deux angles morts :
     · elle ne lisait que `app.js` — or `mfa.js` lit `#mfaOpen`, `#mfaBadge`… ;
     · elle ignorait la CONCATÉNATION — les panneaux de route sont trouvés par
       `'#view-' + route`, jamais écrits en toutes lettres.
   Un outil qui crie au loup finit ignoré, et alors il ne protège plus rien
   (E-208, E-222). On lit donc TOUS les fichiers servis, et on écarte tout
   préfixe qui apparaît dans une chaîne du code. */
const autresJs = (await Promise.all(
  ['mfa.js', 'sw.js', 'firebase-init.js', 'qrcode.js']
    .map((f) => readFile(join(RACINE, f), 'utf8').catch(() => ''))
)).join('\n');
const toutJs = app + '\n' + autresJs;

const ids = [...new Set((html.match(/\bid="([^"]+)"/g) || []).map((s) => s.slice(4, -1)))];
const idsMorts = ids.filter((id) => {
  if (toutJs.indexOf("'" + id + "'") !== -1 || toutJs.indexOf('"' + id + '"') !== -1) return false;
  if (toutJs.indexOf('#' + id) !== -1) return false;
  if (html.indexOf('for="' + id + '"') !== -1) return false;
  if (html.indexOf('#' + id) !== -1) return false;
  if (css.indexOf('#' + id) !== -1) return false;
  /* Construit par concaténation ? On teste chaque préfixe. */
  for (let i = id.length - 1; i > 2; i--) {
    const pref = id.slice(0, i);
    if (toutJs.indexOf("'" + pref) !== -1 || toutJs.indexOf('"' + pref) !== -1
      || toutJs.indexOf("'#" + pref) !== -1) return false;
  }
  return true;
});

const l = (s) => console.log(s);
l('════ FONCTIONS DÉCLARÉES ET JAMAIS APPELÉES ════');
l(orphelines.length + ' sur ' + declarees.size + ' fonctions déclarées');
orphelines.slice(0, 25).forEach((o) => l('   ' + String(o.lignes).padStart(4) + ' lignes  ' + o.nom));
l('   → total : ' + orphelines.reduce((s, o) => s + o.lignes, 0) + ' lignes');
l('');
l('════ CLASSES CSS SANS AUCUN USAGE LITTÉRAL NI CONSTRUIT ════');
l(suspectes.length + ' sur ' + classesCss.size + ' classes définies');
suspectes.slice(0, 40).forEach((c) => l('   .' + c));
l('');
l('════ IDENTIFIANTS HTML QUE PERSONNE NE LIT ════');
l(idsMorts.length + ' sur ' + ids.length);
idsMorts.slice(0, 30).forEach((i) => l('   #' + i));
l('');
l('⛔ Cet outil ne supprime rien. Chaque candidat se vérifie AVANT retrait :');
l('   une classe construite par concaténation semble morte et ne l\'est pas.');
