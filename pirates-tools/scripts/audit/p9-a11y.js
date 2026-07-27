/* =========================================================================
   AUDIT P9 — ACCESSIBILITÉ ET ROBUSTESSE
   =========================================================================
   Volet STATIQUE, exécutable en CI sans navigateur. Le volet MESURÉ (contrastes
   calculés sur les styles réellement appliqués, cibles tactiles au pixel,
   débordement horizontal iPad, stockage saturé, réseau coupé) vit dans
   scratchpad/a11y.mjs (Playwright) — 15 contrôles verts au 27/07/2026, et sa
   faillibilité est prouvée par scratchpad/p9-preuve.mjs (9/9).

   CONTRÔLE 1 — CONTRASTE DU TEXTE (WCAG 2.2 — 1.4.3, niveau AA)
     Le ratio n'est pas listé en dur : il est RECALCULÉ depuis les couleurs
     réellement écrites dans styles.css. Changer un hexadécimal change le
     verdict — c'est le but.

   CONTRÔLE 2 — NOM ACCESSIBLE (WCAG 4.1.2)
     Un bouton ou un lien sans texte visible (icône seule) doit porter un
     aria-label, un title, un <img alt> ou un <svg><title>. Sinon le lecteur
     d'écran annonce « bouton », sans plus.

   CONTRÔLE 3 — INVARIANTS D'ACCESSIBILITÉ déjà acquis (C6, M-*)
     Zoom autorisé, langue déclarée, mouvement réduit respecté, piège de focus
     des modales, focus au changement de route, lien d'évitement.

   Lancement : node scripts/audit/p9-a11y.js
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const VERBOSE = require.main === module;
const LOG = function () { if (VERBOSE) console.log.apply(console, arguments); };
const problems = [];

// Les commentaires sont retirés AVANT toute analyse : sinon ils se collent au
// sélecteur (« /* … */ .wa-float ») et cassent la reconnaissance des
// déclarations, qui s'appuie sur le « ; » ou le début de bloc qui précède.
const CSS = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
const HTML = read('index.html');
const APP = read('app.js');

// ═══ Outils WCAG ══════════════════════════════════════════════════════════
function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function luminance(rgb) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}
function ratio(a, b) {
  const x = Math.max(a, b) + 0.05, y = Math.min(a, b) + 0.05;
  return x / y;
}
const contraste = (fg, bg) => ratio(luminance(hexToRgb(fg)), luminance(hexToRgb(bg)));

// Découpe le CSS en blocs { sélecteur, déclarations }.
function blocs(css) {
  const out = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    if (!sel || sel.startsWith('@')) continue;
    out.push({ sel, decl: m[2] });
  }
  return out;
}
const BLOCS = blocs(CSS);
function declaration(sel, prop) {
  // Dernière valeur gagnante dans l'ordre du fichier, comme la cascade.
  let val = null;
  BLOCS.forEach((b) => {
    if (b.sel !== sel && b.sel.split(',').map((s) => s.trim()).indexOf(sel) === -1) return;
    const re = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'i');
    const m = b.decl.match(re);
    if (m) val = m[1].trim();
  });
  return val;
}
const HEX = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;

// ═══ CONTRÔLE 1 — contraste du texte ══════════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P9.1 — CONTRASTE DU TEXTE (WCAG 1.4.3 AA — seuil 4.5:1)');
LOG('━'.repeat(74));

// Une commande à ICÔNE SEULE ne relève pas de 1.4.3 (texte) mais de 1.4.11
// (non-textuel, seuil 3:1). On ne se fie pas à une liste : on VÉRIFIE dans
// index.html que l'élément portant cette classe ne contient aucun texte.
function iconeSeule(sel) {
  const cls = (sel.match(/\.[A-Za-z0-9_-]+/g) || []).map((c) => c.slice(1));
  if (!cls.length) return false;
  const re = new RegExp('<(button|a)\\b[^>]*class="[^"]*\\b' + cls[cls.length - 1]
    + '\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/\\1>', 'i');
  const m = HTML.match(re);
  if (!m) return false;
  return m[2].replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').trim().length <= 1;
}

// (a) Automatique : tout bloc qui fixe LUI-MÊME une couleur de texte et un
//     fond, tous deux en hexadécimal. Aucune liste à tenir à jour.
let autoN = 0;
BLOCS.forEach((b) => {
  const c = (b.decl.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i) || [])[1];
  const bg = (b.decl.match(/(?:^|;)\s*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})\s*(?:;|$)/i) || [])[1];
  if (!c || !bg) return;
  const fg = c.trim();
  if (!HEX.test(fg) || !HEX.test(bg)) return;
  const seuilBloc = iconeSeule(b.sel) ? 3 : 4.5;
  autoN++;
  const r = contraste(fg, bg);
  if (r < seuilBloc) {
    LOG('  ❌ ' + b.sel + ' : ' + fg + ' sur ' + bg + ' = ' + r.toFixed(2)
      + ':1 (seuil ' + seuilBloc + ')');
    problems.push('contraste insuffisant (WCAG ' + (seuilBloc === 3 ? '1.4.11' : '1.4.3')
      + ' AA) : « ' + b.sel + ' » écrit ' + fg + ' sur ' + bg + ' = ' + r.toFixed(2)
      + ':1, seuil ' + seuilBloc + ':1.');
  }
});
LOG('  ✅ ' + autoN + ' paire(s) texte/fond déclarées dans un même bloc, recalculées');

// (b) Paires COMPOSÉES : la couleur du texte vient du bloc de base, le fond
//     d'un bloc modificateur. Le PAIRAGE est déclaré ici (il ne se devine pas
//     statiquement) ; les COULEURS, elles, sont relues dans le CSS à chaque
//     exécution — modifier un hexadécimal change donc le verdict.
const COMPOSEES = [
  { base: '.footer-social__link', mod: '.footer-social__link--fb', quoi: 'bouton Facebook du pied de page' },
  { base: '.footer-social__link', mod: '.footer-social__link--wa', quoi: 'bouton WhatsApp du pied de page' },
  { base: '.btn.btn-social',      mod: '.btn.btn-fb',              quoi: 'bouton Facebook de la barre haute' }
];
COMPOSEES.forEach((p) => {
  const fg = declaration(p.mod, 'color') || declaration(p.base, 'color');
  const bg = declaration(p.mod, 'background') || declaration(p.mod, 'background-color');
  if (!fg || !bg || !HEX.test(fg.trim()) || !HEX.test(bg.trim())) {
    LOG('  ⚪ ' + p.quoi + ' : pairage non résolu (dégradé ou variable) — non évaluable ici');
    return;
  }
  const r = contraste(fg.trim(), bg.trim());
  // Le bouton de la barre haute ne porte PAS de texte (icône seule) : c'est le
  // critère 1.4.11 (non-textuel, seuil 3:1) qui s'y applique, pas 1.4.3.
  const texte = /footer-social/.test(p.mod);
  const seuil = texte ? 4.5 : 3;
  const ok = r >= seuil;
  LOG('  ' + (ok ? '✅' : '❌') + ' ' + p.quoi + ' : ' + fg.trim() + ' sur ' + bg.trim()
    + ' = ' + r.toFixed(2) + ':1 (seuil ' + seuil + ')');
  if (!ok) {
    problems.push('contraste insuffisant (WCAG ' + (texte ? '1.4.3' : '1.4.11') + ' AA) : '
      + p.quoi + ' — ' + fg.trim() + ' sur ' + bg.trim() + ' = ' + r.toFixed(2) + ':1, '
      + 'seuil ' + seuil + ':1.');
  }
});

// ═══ CONTRÔLE 2 — nom accessible des commandes à icône ════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P9.2 — NOM ACCESSIBLE DES COMMANDES SANS TEXTE (WCAG 4.1.2)');
LOG('━'.repeat(74));

function commandes(html, tag) {
  const out = [];
  const re = new RegExp('<' + tag + '\\b([^>]*)>([\\s\\S]*?)<\\/' + tag + '>', 'gi');
  let m;
  while ((m = re.exec(html))) out.push({ attrs: m[1], inner: m[2] });
  return out;
}
const cmds = commandes(HTML, 'button').concat(
  commandes(HTML, 'a').filter((c) => /\shref\s*=/.test(c.attrs)));
// Les liens téléphone / WhatsApp sont VIDES dans le HTML par construction :
// applyContactChannels() y écrit le numéro au démarrage, et les MASQUE
// (attribut hidden) tant qu'aucun numéro n'est configuré — c'est ce qui évite
// qu'un numéro fuite dans la source. Ils ne sont donc jamais visibles ET muets
// en même temps. On ne le suppose pas : on exige que les deux mécanismes
// existent, sinon la dérogation tombe.
const remplitLibelles = /data-tel-text/.test(APP) && /textContent\s*=\s*fmtPhone\(/.test(APP);
const masqueSansNumero = /hidden\s*=\s*!has/.test(APP);
const derogationContact = remplitLibelles && masqueSansNumero;
LOG('  ' + (derogationContact ? '✅' : '❌')
  + ' liens contact : libellé écrit au démarrage ET masqués sans numéro (dérogation vérifiée)');
if (!derogationContact) {
  problems.push('les liens téléphone/WhatsApp sont vides dans index.html et le code qui '
    + 'les remplit (fmtPhone) ou qui les masque sans numéro (hidden = !has) a disparu : '
    + 'ils deviendraient des commandes muettes et visibles.');
}

let muettes = 0;
cmds.forEach((c) => {
  if (/aria-hidden\s*=\s*"true"/i.test(c.attrs)) return;
  if (/tabindex\s*=\s*"-1"/i.test(c.attrs)) return;
  if (derogationContact && /data-(?:tel|wa)-link/.test(c.attrs)
      && /data-(?:tel|wa)-text/.test(c.inner)) return;
  const texte = c.inner.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').trim();
  if (texte.length > 1) return;                       // libellé visible
  if (/aria-label\s*=\s*"[^"]+"/i.test(c.attrs)) return;
  if (/aria-labelledby\s*=\s*"[^"]+"/i.test(c.attrs)) return;
  if (/title\s*=\s*"[^"]+"/i.test(c.attrs)) return;
  if (/<img[^>]+alt\s*=\s*"[^"]+"/i.test(c.inner)) return;
  if (/<title>[^<]+<\/title>/i.test(c.inner)) return; // <svg><title>
  muettes++;
  const id = (c.attrs.match(/id\s*=\s*"([^"]+)"/i) || [])[1]
    || (c.attrs.match(/class\s*=\s*"([^"]+)"/i) || [])[1] || '(sans identifiant)';
  LOG('  ❌ commande sans nom accessible : ' + id);
  problems.push('commande sans nom accessible (WCAG 4.1.2) : « ' + id + '  » n\'a ni texte, '
    + 'ni aria-label, ni <img alt>, ni <svg><title> — un lecteur d\'écran annonce « bouton ».');
});
LOG('  ' + (muettes ? '❌' : '✅') + ' ' + cmds.length
  + ' commandes examinées dans index.html, ' + muettes + ' sans nom accessible');

// ═══ CONTRÔLE 3 — invariants acquis ═══════════════════════════════════════
LOG('\n' + '━'.repeat(74));
LOG('  P9.3 — INVARIANTS D\'ACCESSIBILITÉ ACQUIS (ne pas régresser)');
LOG('━'.repeat(74));
const inv = [
  ['zoom autorisé : ni user-scalable=no ni maximum-scale (WCAG 1.4.4)',
   !/user-scalable\s*=\s*no/i.test(HTML) && !/maximum-scale/i.test(HTML)],
  ['langue de la page déclarée (WCAG 3.1.1)', /<html[^>]+lang\s*=\s*"[a-z-]+"/i.test(HTML)],
  ['mouvement réduit respecté (WCAG 2.3.3)', /prefers-reduced-motion/.test(CSS)],
  ['piège de focus des modales présent (C6)', /function trapFocus/.test(APP)],
  ['lien d\'évitement présent (WCAG 2.4.1)', /skip-link/.test(HTML) || /skip-link/.test(APP)],
  ['la barre haute annonce l\'état du menu (aria-expanded)', /aria-expanded/.test(HTML)]
];
inv.forEach(([quoi, ok]) => {
  LOG('  ' + (ok ? '✅' : '❌') + ' ' + quoi);
  if (!ok) problems.push('invariant d\'accessibilité rompu : ' + quoi);
});

LOG('\n' + '═'.repeat(74));
LOG(problems.length === 0 ? '  ✅ P9 : accessibilité conforme sur les contrôles statiques.'
  : '  ❌ P9 : ' + problems.length + ' défaut(s).');
LOG('═'.repeat(74) + '\n');

module.exports = async function () { return problems.map((m) => '[P9 a11y] ' + m); };
if (VERBOSE) process.exit(problems.length ? 1 : 0);
