/* tests/pdp-galerie.mjs — LA GALERIE DE VISUELS DE LA FICHE PRODUIT.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE HARNAIS EXISTE

   Demande de l'user, 08/08/2026 : plusieurs photos par produit, qu'on fait
   défiler du doigt, l'outil qui flotte — et une exigence explicite :
   « s'il n'y a qu'un seul PNG on ne peut pas se scroller, MAIS LA FONCTION Y
   EST QUAND MÊME ». Les deux moitiés se vérifient donc séparément : la piste
   existe toujours, et elle ne promet un défilement que quand il y en a un.

   ⛔ CE QUE CE HARNAIS DÉFEND, ET QUI NE SE VOIT PAS DANS LE DOM
   ① Quatre couches, UN SEUL propriétaire de `transform` par couche. C'est la
      faute la plus facile à réintroduire : `transform` n'est pas cumulatif,
      deux règles sur le même élément et la dernière écrite efface l'autre —
      sans erreur, sans trace. Si la parallaxe descendait sur la couche du
      flottement, le flottement disparaîtrait ; si elle montait sur l'image,
      c'est le CADRAGE au pixel qui sauterait, et le produit sortirait du
      cadre. On vérifie donc que les trois transforms coexistent.
   ② La cellule DÉCOUPE. Mesuré en 390 px avant correction : la parallaxe
      tirait la vignette suivante de 18 % vers la gauche, et l'outil d'à côté
      apparaissait dans le visuel courant.
   ③ Les pastilles sont VISIBLES et cliquables. Posées en absolu, elles
      tombaient — mesuré — sous le titre et derrière le bandeau cookies.
      Une pastille qu'on ne voit pas n'indique rien.

   ⛔ IL NE NOMME AUCUN PRODUIT. Les sujets sont choisis À L'EXÉCUTION dans le
   catalogue réel, sur un critère : « il a plusieurs visuels », « il n'en a
   qu'un ». Dix-huit harnais sont morts pour avoir gravé une référence.
   ───────────────────────────────────────────────────────────────────────── */
import { playwright, optionsNavigateur, serveur, couperLeTiers, compteur, RACINE } from './_socle.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const c = compteur('pdp-galerie — plusieurs visuels par fiche');
const s = await serveur();
const pw = await playwright();
const nav = await pw.chromium.launch(optionsNavigateur());

try {
  const brut = JSON.parse(await readFile(join(RACINE, 'products.json'), 'utf8'));
  const liste = Array.isArray(brut) ? brut : (brut.products || []);
  const plusieurs = liste.filter((p) => p && p.id && Array.isArray(p.images) && p.images.length > 1);
  const unSeul = liste.filter((p) => p && p.id && p.img && !/placeholder/.test(String(p.img))
    && (!Array.isArray(p.images) || p.images.length <= 1));

  /* ⛔ Sans ces deux sujets, le harnais serait VERT sans avoir rien vérifié. */
  if (!c.prealable('le catalogue contient un produit à PLUSIEURS visuels',
    plusieurs.length > 0, plusieurs.length + ' produit(s)')) throw new Error('préalable');
  if (!c.prealable('le catalogue contient un produit à UN SEUL visuel',
    unSeul.length > 0, unSeul.length + ' produit(s)')) throw new Error('préalable');

  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await couperLeTiers(ctx);
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 120)));

  const lire = () => page.evaluate(() => {
    const g = document.getElementById('pdpGallery');
    const d = document.getElementById('pdpGalleryDots');
    if (!g) return null;
    const vignettes = Array.from(g.children);
    const t = (el) => (el && el.style.transform) || '';
    const cadre = (el) => {
      const r = el.getBoundingClientRect();
      return { h: Math.round(r.top), b: Math.round(r.bottom), large: Math.round(r.width) };
    };
    const titre = document.getElementById('pdpTitle');
    /* Ce qui est réellement au-dessus des pastilles à l'écran : `hidden` et
       `opacity` mentent, un élément recouvert paraît présent. */
    let dessus = null;
    if (d && !d.hidden) {
      const r = d.getBoundingClientRect();
      const e = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      dessus = e ? (e.className || e.tagName) : null;
    }
    return {
      nbVignettes: vignettes.length,
      peutDefiler: g.scrollWidth > g.clientWidth + 1,
      scrollLeft: Math.round(g.scrollLeft),
      largeurPiste: g.clientWidth,
      pastilles: d ? (d.hidden ? 0 : d.children.length) : -1,
      pastilleActive: d && !d.hidden
        ? Array.from(d.children).findIndex((x) => x.classList.contains('pdp-gallery__dot--on'))
        : null,
      cadrePastilles: d && !d.hidden ? cadre(d) : null,
      cadreTitre: titre ? cadre(titre) : null,
      dessusPastilles: dessus,
      couches: vignettes.map((v) => {
        const prof = v.querySelector('.pdp-gallery__depth');
        const flot = v.querySelector('.pdp-gallery__float');
        const im = v.querySelector('.pdp-hero__img');
        return {
          decoupe: getComputedStyle(v).overflow,
          transformCellule: t(v),
          transformProfondeur: t(prof),
          animationFlottement: flot ? getComputedStyle(flot).animationName : null,
          transformImage: t(im),
          src: im ? im.getAttribute('src') : null
        };
      })
    };
  });

  /* ── ① PLUSIEURS VISUELS ──────────────────────────────────────────────── */
  const multi = plusieurs[0];
  await page.goto(s.base + '/#/produit/' + multi.id, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  let vu = await lire();

  c.T('la piste existe sur la fiche produit', !!vu, vu ? 'présente' : 'ABSENTE');
  c.T('une vignette par visuel du catalogue',
    vu.nbVignettes === multi.images.length,
    vu.nbVignettes + ' vignette(s) pour ' + multi.images.length + ' visuel(s)');
  c.T('chaque vignette porte SON visuel, dans l\'ordre du catalogue',
    vu.couches.every((k, i) => k.src === multi.images[i]),
    vu.couches.map((k) => k.src).join(' · '));
  c.T('plusieurs visuels ⇒ le défilement est réellement possible',
    vu.peutDefiler === true, 'scrollWidth > clientWidth : ' + vu.peutDefiler);
  c.T('une pastille par visuel, la première active',
    vu.pastilles === multi.images.length && vu.pastilleActive === 0,
    vu.pastilles + ' pastille(s), active=' + vu.pastilleActive);

  /* ⛔ LES QUATRE COUCHES. Chacune doit garder SON transform : si l'une écrase
     l'autre, l'effet correspondant disparaît en silence. */
  const c0 = vu.couches[0], c1 = vu.couches[1];
  c.T('la cellule DÉCOUPE son contenu (sinon la vignette voisine déborde)',
    vu.couches.every((k) => k.decoupe === 'hidden'),
    vu.couches.map((k) => k.decoupe).join(', '));
  c.T('la cellule ne porte AUCUN transform — sinon elle emporte son découpage',
    vu.couches.every((k) => !k.transformCellule),
    vu.couches.map((k) => k.transformCellule || '(aucun)').join(' | '));
  c.T('la couche de profondeur porte la parallaxe',
    /translateX/.test(c0.transformProfondeur) && /translateX/.test(c1.transformProfondeur),
    c0.transformProfondeur + ' | ' + c1.transformProfondeur);
  c.T('la vignette voisine est DÉCALÉE, pas alignée sur la courante',
    c0.transformProfondeur !== c1.transformProfondeur,
    'courante=' + c0.transformProfondeur + '  voisine=' + c1.transformProfondeur);
  c.T('le flottement tourne sur sa propre couche',
    vu.couches.every((k) => k.animationFlottement && k.animationFlottement !== 'none'),
    vu.couches.map((k) => k.animationFlottement).join(', '));
  c.T('le cadrage au pixel survit sur l\'image, sous les deux autres couches',
    vu.couches.every((k) => /scale\(|translateY\(/.test(k.transformImage)),
    vu.couches.map((k) => k.transformImage || '(aucun)').join(' | '));

  /* ⛔ LES PASTILLES SE VOIENT, SINON ELLES N'INDIQUENT RIEN. */
  c.T('les pastilles sont AU-DESSUS du titre, jamais dessous',
    vu.cadrePastilles && vu.cadreTitre && vu.cadrePastilles.b <= vu.cadreTitre.h,
    'pastilles bas=' + (vu.cadrePastilles && vu.cadrePastilles.b)
    + ' · titre haut=' + (vu.cadreTitre && vu.cadreTitre.h));
  c.T('rien ne recouvre les pastilles — c\'est bien une pastille qu\'on touche',
    /pdp-gallery__dot/.test(String(vu.dessusPastilles)),
    'au point central : ' + vu.dessusPastilles);

  /* ── ② LE BALAYAGE CHANGE DE VISUEL ET SUIT LES PASTILLES ─────────────── */
  await page.evaluate(() => {
    const g = document.getElementById('pdpGallery');
    g.scrollTo({ left: g.clientWidth, behavior: 'auto' });
  });
  await page.waitForTimeout(600);
  const apres = await lire();
  c.T('après balayage, la piste est sur la 2e vignette',
    apres.scrollLeft === apres.largeurPiste,
    'scrollLeft=' + apres.scrollLeft + ' pour une piste de ' + apres.largeurPiste + ' px');
  c.T('la pastille active a suivi le balayage',
    apres.pastilleActive === 1, 'active=' + apres.pastilleActive);
  c.T('la parallaxe s\'est INVERSÉE : la vignette quittée passe de l\'autre côté',
    apres.couches[0].transformProfondeur !== c0.transformProfondeur,
    'avant=' + c0.transformProfondeur + '  après=' + apres.couches[0].transformProfondeur);

  /* ── ③ UN SEUL VISUEL : LA FONCTION EST LÀ, LA PROMESSE NE L'EST PAS ──── */
  const solo = unSeul[0];
  /* ⚠️ `?b=2` : deux `goto()` sur la MÊME URL ne rechargent pas — c'est une
     navigation same-document, l'application ne se ré-initialise pas et on
     mesurerait encore la fiche précédente. On fait varier l'URL. */
  await page.goto(s.base + '/?b=2#/produit/' + solo.id, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const seul = await lire();
  c.T('un seul visuel : la piste EXISTE quand même (demande explicite de l\'user)',
    !!seul && seul.nbVignettes === 1, seul ? seul.nbVignettes + ' vignette' : 'piste ABSENTE');
  c.T('un seul visuel : rien à faire défiler',
    seul.peutDefiler === false, 'peutDefiler=' + seul.peutDefiler);
  c.T('un seul visuel : aucune pastille — on ne promet pas ce qui n\'existe pas',
    seul.pastilles === 0, seul.pastilles + ' pastille(s)');
  c.T('un seul visuel : le flottement tourne quand même',
    seul.couches[0].animationFlottement && seul.couches[0].animationFlottement !== 'none',
    seul.couches[0].animationFlottement);

  c.T('aucune erreur JavaScript sur la fiche produit',
    erreurs.length === 0, erreurs.length ? erreurs.join(' | ') : 'aucune');

  await ctx.close();
} finally {
  await nav.close();
  await s.fermer();
}

/* ⛔ `terminer()`, PAS `bilan()`. `bilan()` imprime et rend l'objet ; il ne
   touche PAS au code de sortie. Un harnais qui affiche ❌ et sort en 0 est vu
   VERT par `tests/lancer.mjs`, qui juge sur le code — c'est exactement « lire
   le silence comme un succès » (registre O7). Mesuré sur ce fichier même :
   premier sabotage, contrôle rouge à l'écran, code 0. */
c.terminer();
