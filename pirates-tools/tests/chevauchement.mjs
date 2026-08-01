/* tests/chevauchement.mjs — RIEN DE FLOTTANT NE RECOUVRE UN ÉLÉMENT CLIQUABLE.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE HARNAIS EXISTE

   Le 01/08/2026, l'user signale « du chevauchement sur certains trucs » —
   une demande ancienne, jamais traitée. Le site porte deux éléments en
   `position: fixed` (le dock 🏠🛠️🛒 et la bulle de discussion) : s'ils
   recouvrent un bouton, le client tape dessus et touche autre chose. Sur un
   catalogue, un « Ajouter aux favoris » inatteignable est une vente qui
   s'en va sans bruit.

   ⚠️ CE HARNAIS EST NÉ D'UNE FAUSSE ALERTE, ET ELLE EST INSTRUCTIVE.
   Ma première sonde a mesuré « 3 chevauchements » en bas du catalogue…
   parce qu'elle a photographié le MILIEU du trajet de défilement : le site a
   un défilement doux global, `scrollTo` anime, et 500 ms n'ont pas suffi
   pour 8 600 px. Le piège est ÉCRIT dans les règles des harnais depuis le
   29/07 — je l'ai rejoué quand même, et j'ai failli « corriger » un défaut
   inexistant (la réserve `padding-bottom: calc(var(--dockH) + …)` existe et
   suffit ; mesuré : 8630/8630 atteint, zéro conflit).

   D'où les deux exigences de la mesure, non négociables :
     · défilement INSTANTANÉ (`scrollBehavior='auto'` + `behavior:'instant'`) ;
     · on ne mesure qu'une fois `scrollY` STABILISÉ au maximum — et le
       préalable ÉCHOUE si le maximum n'est pas atteint, parce qu'une mesure
       en vol ne dit rien (c'est elle qui a menti).

   ⛔ CE QU'IL NE COUVRE PAS, dit franchement : le passage TRANSITOIRE du
   contenu sous le dock PENDANT le défilement — c'est le principe même d'une
   barre flottante (les barres d'onglets d'iOS font pareil), pas un défaut.
   Et il ne voit que les routes listées ici, aux positions haut et bas.
   ───────────────────────────────────────────────────────────────────────── */
import { playwright, RACINE, serveur, optionsNavigateur, couperLeTiers, compteur } from './_socle.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const c = compteur('chevauchement — le flottant ne vole aucun tap');
const s = await serveur();
const pw = await playwright();
const nav = await pw.chromium.launch(optionsNavigateur());

/* Le produit s'ouvre par une fiche RÉELLE choisie à l'exécution — jamais
   nommée : la règle des harnais a déjà tué dix-huit tests pour ça. */
const cat = JSON.parse(await readFile(join(RACINE, 'products.json'), 'utf8'));
const fiche = (Array.isArray(cat) ? cat : cat.products).find((p) => p.id || p.slug);
const ROUTES = ['#/', '#/catalogue', '#/devis', '#/compte', '#/artisans',
  '#/produit/' + (fiche.id || fiche.slug)];
/* 820 = iPad portrait, l'appareil de l'user. 390 = téléphone étroit. */
const ECRANS = [{ w: 820, h: 1180 }, { w: 390, h: 844 }];

async function mesurer(pg) {
  return pg.evaluate(() => {
    const flottants = [document.getElementById('dock'), document.querySelector('.chat-bubble')]
      .filter(Boolean)
      .filter((e) => {
        const st = getComputedStyle(e);
        return st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity) > 0.05;
      });
    const cibles = [...document.querySelectorAll('a, button, input, select, textarea')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0;
      });
    const conflits = [];
    for (const f of flottants) {
      const rf = f.getBoundingClientRect();
      for (const cible of cibles) {
        if (f.contains(cible) || cible.contains(f)) continue;
        const rc = cible.getBoundingClientRect();
        const x = Math.max(0, Math.min(rf.right, rc.right) - Math.max(rf.left, rc.left));
        const y = Math.max(0, Math.min(rf.bottom, rc.bottom) - Math.max(rf.top, rc.top));
        /* 4 px de tolérance : un effleurement de boîte n'empêche aucun tap,
           et sans elle le harnais crierait sur des ombres. */
        if (x > 4 && y > 4) {
          conflits.push((f.id || f.className.split(' ')[0]) + ' → « '
            + ((cible.textContent || cible.getAttribute('aria-label') || '?').trim().slice(0, 30))
            + ' » (' + Math.round(x) + '×' + Math.round(y) + 'px)');
        }
      }
    }
    return conflits;
  });
}

try {
  const ctx = await nav.newContext();
  await couperLeTiers(ctx);
  const pg = await ctx.newPage();
  await pg.addInitScript(() => {
    try { localStorage.setItem('pt:analytics-consent', 'denied'); } catch (_) {}
  });

  let dockVu = false;
  for (const ecran of ECRANS) {
    await pg.setViewportSize({ width: ecran.w, height: ecran.h });
    for (const route of ROUTES) {
      // URL variée à chaque passage : deux goto() identiques ne rechargent pas.
      await pg.goto(s.base + '/index.html?b=' + ecran.w + route, { waitUntil: 'domcontentloaded' });
      await pg.waitForTimeout(1300);
      await pg.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
      if (await pg.evaluate(() => !!document.getElementById('dock'))) dockVu = true;

      /* ── position HAUT : INFORMATIF, jamais une assertion ─────────────
         Premier jet : le haut était asserté, et 4 routes saines rougissaient.
         Or un élément sous le dock en haut d'une page DÉFILABLE se remonte
         d'un geste — c'est le principe d'une barre flottante (les barres
         d'onglets d'iOS recouvrent pareil). L'asserter, c'est E-222 : une
         porte qui crie sur du sain finit désactivée. Le seul cas indéfendable
         est le VRAI BAS : là, rien ne peut plus s'échapper — et une page qui
         ne défile pas du tout a son « haut » égal à son « bas », donc elle
         est couverte par l'assertion du bas. */
      const haut = await mesurer(pg);
      if (haut.length) console.log('   ℹ️ passage transitoire en haut de ' + route
        + ' (' + ecran.w + 'px) : ' + haut.length + ' — se dégage au défilement, non asserté');

      // ── position BAS — mesurée seulement une fois le maximum ATTEINT ──
      let prev = -1, y = 0, max = 0;
      for (let i = 0; i < 25; i++) {
        await pg.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        await pg.waitForTimeout(160);
        [y, max] = await pg.evaluate(() => [Math.round(scrollY),
          Math.round(document.documentElement.scrollHeight - innerHeight)]);
        if (y === prev) break;
        prev = y;
      }
      if (max > 0 && y < max - 2) {
        c.T('PRÉALABLE : le bas de ' + route + ' est atteint (' + ecran.w + 'px)', false,
          y + '/' + max + ' — une mesure en vol ne dit RIEN (c\'est elle qui a produit la fausse alerte)');
        continue;
      }
      /* ⛔ SECONDE FAUSSE MESURE DU MÊME HARNAIS, attrapée par sabotage :
         l'application CACHE le dock pendant le défilement (`dock--hidden`)
         et le fait réapparaître à l'arrêt. Mesurer juste après le dernier
         geste, c'est mesurer un dock invisible → zéro conflit PAR
         CONSTRUCTION — le harnais restait vert avec le dock remonté de
         220 px en plein contenu. On attend donc que le dock soit REVENU,
         et si la page en montre un, son retour est un PRÉALABLE : un dock
         qui ne réapparaît jamais rendrait la mesure vide de sens. */
      let dockRevenu = false;
      for (let j = 0; j < 15; j++) {
        await pg.waitForTimeout(200);
        dockRevenu = await pg.evaluate(() => {
          const d = document.getElementById('dock');
          if (!d) return false;
          const st = getComputedStyle(d);
          return st.display !== 'none' && parseFloat(st.opacity) > 0.5;
        });
        if (dockRevenu) break;
      }
      const dockExiste = await pg.evaluate(() => !!document.getElementById('dock'));
      if (dockExiste && !dockRevenu) {
        c.T('PRÉALABLE : le dock est revenu à l\'arrêt du défilement sur ' + route
          + ' (' + ecran.w + 'px)', false, 'invisible après 3 s — mesure vide de sens');
        continue;
      }
      const bas = await mesurer(pg);
      c.T('aucun tap volé au VRAI BAS de ' + route + ' (' + ecran.w + 'px)',
        bas.length === 0, bas.slice(0, 2).join(' · ') || (y + '/' + max + ' atteint, net'));
    }
  }
  // Sans dock rendu nulle part, tout ce qui précède aurait vérifié du vide.
  c.T('PRÉALABLE : le dock flottant a bien été rencontré au moins une fois',
    dockVu, dockVu ? 'présent' : 'JAMAIS RENDU — le harnais n\'a rien contrôlé');
} catch (e) {
  c.T('le harnais va au bout sans exception', false, String((e && e.message) || e).slice(0, 90));
} finally {
  await nav.close();
  await s.fermer();
}

export default c.bilan();
if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = c.echecs ? 1 : 0;
