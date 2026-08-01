/* tests/pdp-specs.mjs — LE RENDU DES CARACTÉRISTIQUES SUR LA FICHE PRODUIT.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE HARNAIS EXISTE
   Cinq harnais couvraient ce comportement (`verify-lot2`, `verify-lot3`,
   `verify-products`, `verify-oldspecs`, `shot-fix`). Ils ont été SUPPRIMÉS le
   28/07/2026 : ils étaient ancrés sur l'état du catalogue au 18/07 et
   nommaient des produits que l'user a depuis volontairement retirés
   (DCF894P2, TSC55, CL2.C18S, DCF620, DCD996P2). Ils échouaient donc en
   affirmant qu'un choix de l'user était un défaut.
   Leur disparition a laissé un TROU : plus personne ne vérifiait que les
   caractéristiques s'affichent réellement sur une fiche.

   ⚠️ CE TROU A UNE HISTOIRE. Bug v334 : les lignes `.pdp-specs-table tr`
   partent en `opacity: 0` et sont révélées au défilement. Or
   `initPdpScrollAnimations()` était appelée AVANT l'injection des specs — les
   nouvelles lignes n'étaient jamais animées, donc restaient INVISIBLES.
   Un test qui compte les lignes du DOM aurait été vert. Ce harnais mesure
   donc aussi l'OPACITÉ RÉELLE, parce que « présent dans le DOM » et « visible
   à l'écran » sont deux choses différentes.

   ⛔ RÈGLE ABSOLUE DE CE FICHIER : il ne nomme AUCUN produit.
   C'est la faute qui a tué les cinq précédents, et qu'on a retrouvée dans
   sept autres harnais le même jour. Le produit de test est CHOISI À
   L'EXÉCUTION dans le catalogue réel, sur un critère (« il a des specs »).
   Aucune suppression future ne peut casser ce harnais.
   ───────────────────────────────────────────────────────────────────────── */
import { playwright, optionsNavigateur, serveur, couperLeTiers, compteur, RACINE } from './_socle.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const c = compteur('pdp-specs — rendu des caractéristiques');
const s = await serveur();
const pw = await playwright();
const nav = await pw.chromium.launch(optionsNavigateur());

try {
  /* ── Choix des produits, à l'exécution, dans le catalogue RÉEL ────────── */
  const brut = JSON.parse(await readFile(join(RACINE, 'products.json'), 'utf8'));
  const liste = Array.isArray(brut) ? brut : (brut.products || []);
  const avecSpecs = liste.filter((p) => p && p.id && p.specs
    && ((Array.isArray(p.specs) && p.specs.length) || Object.keys(p.specs || {}).length));
  const sansSpecs = liste.filter((p) => p && p.id
    && (!p.specs || (Array.isArray(p.specs) ? !p.specs.length : !Object.keys(p.specs).length)));

  // Sans ce préalable, le harnais serait VERT sans rien avoir vérifié.
  if (!c.prealable('le catalogue contient au moins un produit AVEC des caractéristiques',
      avecSpecs.length > 0, avecSpecs.length + ' produit(s)')) throw new Error('préalable');

  const cible = avecSpecs[0];
  const nbAttendu = Array.isArray(cible.specs) ? cible.specs.length : Object.keys(cible.specs).length;

  const ctx = await nav.newContext({ viewport: { width: 900, height: 1400 } });
  await couperLeTiers(ctx);
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 120)));

  /* ── 1. Le bloc existe et porte le bon nombre de lignes ───────────────── */
  await page.goto(s.base + '/#/produit/' + cible.id, { waitUntil: 'load' });
  await page.waitForTimeout(1600);

  /* ⚠️ IL FAUT DÉFILER AVANT DE MESURER — sinon on mesure une opacité 0
     parfaitement normale, et on crie au bug sur un comportement voulu.
     Les lignes sont révélées au défilement (initPdpScrollAnimations).
     ⚠️ `behavior: 'instant'` est OBLIGATOIRE : le défilement doux global du
     site fausse les lectures (règle acquise lors de l'audit des boutons du
     15/07). Avec 'smooth', la mesure part avant l'arrivée. */
  await page.evaluate(() => {
    const t = document.querySelector('.pdp-specs-table');
    if (t) t.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  /* ⚠️ ON ATTEND LA FIN DE L'ANIMATION, on ne la devine pas.
     ─────────────────────────────────────────────────────────────────────
     Défaut trouvé le 01/08/2026 : deux exécutions du MÊME code donnaient
     68/68 et 67/68. Cause mesurée — l'opacité est une apparition progressive,
     et ce harnais lisait à 1500 ms fixes :

         500 ms → min 0,615    1500 ms → min 0,901    3000 ms → min 0,917

     Le seuil de l'assertion valait 0,9. À 1500 ms la mesure tombe PILE
     dessus : sous charge (deux lots de harnais en parallèle), elle passe à
     0,89 et le harnais accuse le produit. Un délai fixe posé au milieu d'une
     animation est un tirage au sort.
     On attend donc que la valeur CESSE DE BOUGER — deux relevés identiques
     à 300 ms d'intervalle — avec une borne pour ne jamais tourner sans fin. */
  const lireOpacites = () => page.evaluate(() => {
    const L = [...document.querySelectorAll('.pdp-specs-table tr')];
    const hautes = L.filter((l) => {
      const r = l.getBoundingClientRect();
      return r.top > 0 && r.top < window.innerHeight * 0.5;
    });
    const op = (l) => parseFloat(getComputedStyle(l).opacity) || 0;
    return hautes.length ? hautes.map(op) : [];
  });
  let precedent = null, stable = false;
  for (let i = 0; i < 20 && !stable; i++) {
    await page.waitForTimeout(300);
    const maintenant = (await lireOpacites()).map((x) => x.toFixed(3)).join(',');
    stable = precedent !== null && maintenant === precedent && maintenant !== '';
    precedent = maintenant;
  }
  c.T('PRÉALABLE : l\'apparition des lignes s\'est stabilisée avant la mesure',
    stable, stable ? 'valeurs figées' : 'TOUJOURS EN MOUVEMENT après 6 s — mesure non fiable');

  const vu = await page.evaluate(() => {
    const t = document.querySelector('.pdp-specs-table');
    const lignes = document.querySelectorAll('.pdp-specs-table tr');
    return {
      bloc: !!t,
      lignes: lignes.length,
      /* « présent dans le DOM » ≠ « visible » : c'est exactement le bug v334.
         ⚠️ MESURE CALIBRÉE SUR LE COMPORTEMENT RÉEL, pas sur une supposition.
         L'opacité n'est pas un interrupteur : c'est un DÉGRADÉ piloté par la
         position de défilement (mesuré : ligne 0 à 1,00 · ligne 12 à 0,18,
         toutes dans la fenêtre). Exiger « toutes les lignes > 0,5 » était donc
         une assertion FAUSSE — elle aurait échoué sur un site parfaitement sain.
         Ce que la panne v334 produisait, c'est TOUTES les lignes bloquées à 0.
         On mesure donc les lignes de la MOITIÉ HAUTE de la fenêtre : celles-là
         doivent être pleinement révélées. */
      opaciteHaut: (function () {
        const hautes = [...lignes].filter((l) => {
          const r = l.getBoundingClientRect();
          return r.top > 0 && r.top < window.innerHeight * 0.5;
        });
        return hautes.length
          ? Math.min(...hautes.map((l) => parseFloat(getComputedStyle(l).opacity) || 0))
          : -1;
      })(),
      opaciteMax: (function () {
        const hautes = [...lignes].filter((l) => {
          const r = l.getBoundingClientRect();
          return r.top > 0 && r.top < window.innerHeight * 0.5;
        });
        return hautes.length
          ? Math.max(...hautes.map((l) => parseFloat(getComputedStyle(l).opacity) || 0))
          : -1;
      })(),
      nbHautes: [...lignes].filter((l) => {
        const r = l.getBoundingClientRect();
        return r.top > 0 && r.top < window.innerHeight * 0.5;
      }).length,
      texteRempli: [...lignes].filter((l) => (l.textContent || '').trim().length > 2).length
    };
  });

  c.T('le bloc des caractéristiques est rendu', vu.bloc, 'produit=' + cible.id);
  c.T('il porte autant de lignes que le catalogue en déclare',
    vu.lignes >= nbAttendu, 'rendu=' + vu.lignes + ' déclaré=' + nbAttendu);
  c.T('chaque ligne porte du texte, pas des cases vides',
    vu.texteRempli === vu.lignes && vu.lignes > 0, vu.texteRempli + '/' + vu.lignes);

  /* ── 2. Les lignes sont VISIBLES — le piège du bug v334 ───────────────── */
  c.T('des lignes atteignent le haut de la fenêtre après défilement',
    vu.nbHautes > 0, vu.nbHautes + ' ligne(s)');
  /* ⛔ CE QUE LA PANNE v334 PRODUISAIT : toutes les lignes bloquées à 0.
     L'assertion portait sur le MINIMUM d'une bande à mi-dégradé, avec un
     seuil à 0,9 — arbitraire, et posé exactement là où la valeur se trouve.
     On teste maintenant les deux bouts, chacun avec de la marge (mesuré,
     une fois stabilisé : min 0,917 · max 1,000) :
       · au moins une ligne est PLEINEMENT révélée (max ≈ 1) ;
       · aucune ligne du haut n'est restée près de zéro (min > 0,5).
     Sous v334, max valait 0 : les deux tombent. */
  c.T('au moins une ligne du haut est PLEINEMENT révélée (panne v334 : opacity 0 jamais levée)',
    vu.opaciteMax >= 0.99, 'opacité maximale en haut de fenêtre=' + vu.opaciteMax.toFixed(3));
  c.T('aucune ligne du haut n\'est restée près de zéro',
    vu.opaciteHaut > 0.5, 'opacité minimale en haut de fenêtre=' + vu.opaciteHaut.toFixed(3));

  /* ── 3. Un produit SANS specs ne montre pas un bloc vide ──────────────── */
  if (sansSpecs.length) {
    await page.evaluate((id) => { location.hash = '#/produit/' + id; }, sansSpecs[0].id);
    await page.waitForTimeout(1400);
    const vide = await page.evaluate(() => {
      const t = document.querySelector('.pdp-specs-table');
      return { absent: !t, visible: !!(t && t.offsetParent !== null),
               lignes: document.querySelectorAll('.pdp-specs-table tr').length };
    });
    c.T('un produit sans caractéristique n\'affiche PAS un tableau vide',
      vide.absent || !vide.visible || vide.lignes === 0,
      'produit=' + sansSpecs[0].id + ' lignes=' + vide.lignes);
  } else {
    c.T('aucun produit sans caractéristique au catalogue — cas non testable, et c\'est dit',
      true, 'tous les produits ont des specs');
  }

  /* ── 4. Aucune erreur JS : une fiche qui plante n'affiche rien ────────── */
  c.T('aucune erreur JavaScript sur la fiche produit', erreurs.length === 0,
    erreurs[0] || 'aucune');

  await ctx.close();
} finally {
  await nav.close();
  s.fermer();
}

c.terminer();
