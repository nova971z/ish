/* tests/admin-fiche.mjs — LA FICHE PRODUIT COMPLÈTE DANS L'ADMINISTRATION.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE HARNAIS EXISTE

   Demande de l'user, 08/08/2026 : « dans la partie produit dans administrateur
   il faut que tu rajoutes une barre de recherche […] et je dois pouvoir
   modifier la fiche produit complète […] là ça affiche que le libellé et le
   prix, je veux pouvoir tout modifier, description / fiche technique / png (je
   veux même pouvoir rajouter des PNG pour qu'il y ait plusieurs visuels) ».

   ⛔ ON N'AUTHENTIFIE PAS, ON EXTRAIT LES VRAIES FABRIQUES DE BALISAGE. Même
   technique que `adminliv.mjs` : le code d'`app.js` est prélevé et exécuté tel
   quel dans la page. Un harnais qui réimplémenterait le rendu testerait sa
   propre copie — et resterait vert le jour où le produit change.

   ⛔ CE QU'IL DÉFEND, ET QUI SE PERD SANS BRUIT
   ① Chaque champ de la fiche est PRÉSENT et PRÉ-REMPLI. Un formulaire qui
      s'ouvre vide fait croire que la fiche est vide : on enregistre, et on
      efface une description qu'on croyait recopier.
   ② Le PRIX n'est PAS dans ce panneau. « Plus aucun prix n'est saisi à la
      main » est une règle produit ; un champ prix noyé dans un formulaire de
      description la contournerait sans que personne le remarque.
   ③ Les visuels DÉJÀ posés sont tous montrés, dans leur ordre — le premier
      est celui de la carte du catalogue.

   ⛔ IL NE NOMME AUCUN PRODUIT DU CATALOGUE : la fiche d'essai est fabriquée
   ici, de toutes pièces. Dix-huit harnais sont morts pour avoir gravé une
   référence réelle.
   ───────────────────────────────────────────────────────────────────────── */
import { playwright, optionsNavigateur, serveur, compteur, RACINE } from './_socle.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const c = compteur('admin-fiche — édition complète du produit');
const s = await serveur();
const pw = await playwright();
const nav = await pw.chromium.launch(optionsNavigateur());

try {
  const src = await readFile(join(RACINE, 'app.js'), 'utf8');
  const grab = (n) => {
    const i = src.indexOf('function ' + n + '(');
    if (i < 0) throw new Error(n + ' introuvable dans app.js');
    let d = 0;
    const j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
    }
    throw new Error('accolades non refermées pour ' + n);
  };
  const cst = (re) => {
    const m = src.match(re);
    if (!m) throw new Error('constante introuvable : ' + re);
    return m[0];
  };
  const CODE = [
    cst(/var _HTML_ESCAPES = \{[\s\S]*?\};/),
    grab('escapeHTML'),
    grab('adminLigneSpecHtml'), grab('adminLigneFeatHtml'), grab('adminVisuelHtml'),
    grab('adminFicheHtml')
  ].join('\n');

  const ctx = await nav.newContext({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e).slice(0, 140)));
  await page.goto(s.base + '/index.html', { waitUntil: 'domcontentloaded' });

  const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const vu = await page.evaluate(({ CODE, PIXEL }) => {
    eval(CODE);
    /* Une fiche d'essai COMPLÈTE : si un champ du produit n'est pas représenté
       dans le formulaire, il devient invisible et se perd au prochain
       enregistrement. */
    const fiche = {
      id: 'zz-essai-fiche', sku: 'ZZ-ESSAI',
      title: 'Titre témoin', desc: 'Phrase courte témoin',
      description_long: 'Description longue témoin, sur plusieurs lignes.',
      tag: 'Témoin', weight_kg: 3.25, poidsSuppose: true,
      price: 199.99,
      specs: { 'Tension': '18 V', 'Poids': '3,25 kg' },
      features: ['Premier point fort', 'Second point fort'],
      images: [PIXEL, 'images/placeholder.svg']
    };
    const hote = document.createElement('div');
    hote.id = '__admFiche';
    hote.className = 'admin-wrap';
    /* Fond opaque : sans lui, la capture laisse voir la page du site derrière
       le panneau et on ne juge plus rien. */
    hote.style.cssText = 'position:fixed;left:0;top:0;width:880px;background:#0a0f14;'
      + 'padding:18px;z-index:99999';
    hote.innerHTML = '<div class="admin-row admin-row--ouverte">'
      + '<div class="admin-fiche">' + adminFicheHtml(fiche) + '</div></div>';
    document.body.appendChild(hote);

    const val = (sel) => { const e = hote.querySelector(sel); return e ? e.value : null; };
    const champs = Array.from(hote.querySelectorAll('[data-fiche]'))
      .map((e) => e.getAttribute('data-fiche'));
    return {
      champs: champs,
      title: val('[data-fiche="title"]'),
      desc: val('[data-fiche="desc"]'),
      descLong: val('[data-fiche="description_long"]'),
      poids: val('[data-fiche="weight_kg"]'),
      tag: val('[data-fiche="tag"]'),
      noteePoidsSuppose: /SUPPOS/i.test(hote.textContent),
      specsK: Array.from(hote.querySelectorAll('[data-spec-k]')).map((e) => e.value),
      specsV: Array.from(hote.querySelectorAll('[data-spec-v]')).map((e) => e.value),
      feats: Array.from(hote.querySelectorAll('[data-feat]')).map((e) => e.value),
      visuels: Array.from(hote.querySelectorAll('.admin-vis')).map((e) => e.getAttribute('data-src')),
      /* Ce que le panneau NE doit PAS contenir. */
      champPrix: hote.querySelectorAll('[data-fiche="price"], [data-fiche="price_ht"]').length,
      /* Tout élément actionnable porte un nom accessible — règle du projet :
         « tout champ visible porte un <label> ou un aria-label ; tout bouton
         sans texte porte un aria-label ».
         ⚠️ UN `<label>` ENGLOBANT COMPTE. Ma première version l'ignorait et
         accusait le champ d'ajout de visuels, qui EST étiqueté par le
         `<span>` de son label — une assertion fausse qui aurait fait
         « corriger » du code déjà juste. On mesure donc le nom réel :
         texte propre, `aria-label`, ou texte du `<label>` parent. */
      sansNom: Array.from(hote.querySelectorAll('button, input, textarea, select'))
        .filter((e) => {
          if (e.getAttribute('aria-label')) return false;
          if (e.textContent && e.textContent.trim()) return false;
          const lab = e.closest('label');
          return !(lab && lab.textContent.trim());
        })
        .map((e) => e.tagName.toLowerCase() + (e.type ? '[' + e.type + ']' : '')),
      ajoutMultiple: !!hote.querySelector('[data-ajout-img][multiple]')
    };
  }, { CODE, PIXEL });

  c.T('le panneau porte tous les champs de texte de la fiche',
    ['title', 'desc', 'description_long', 'weight_kg', 'tag'].every((k) => vu.champs.indexOf(k) !== -1),
    vu.champs.join(', '));
  c.T('le titre est PRÉ-REMPLI, pas vide', vu.title === 'Titre témoin', JSON.stringify(vu.title));
  c.T('la phrase courte est pré-remplie', vu.desc === 'Phrase courte témoin', JSON.stringify(vu.desc));
  c.T('la description longue est pré-remplie',
    /Description longue témoin/.test(String(vu.descLong)), JSON.stringify(String(vu.descLong).slice(0, 40)));
  c.T('le poids est pré-rempli', Number(vu.poids) === 3.25, vu.poids);
  c.T('un poids SUPPOSÉ est signalé comme tel', vu.noteePoidsSuppose === true,
    vu.noteePoidsSuppose ? 'mention présente' : 'AUCUNE mention — on croirait le poids mesuré');

  c.T('chaque caractéristique existante a sa ligne, clé ET valeur',
    vu.specsK.length === 2 && vu.specsV.length === 2 && vu.specsK[0] === 'Tension' && vu.specsV[0] === '18 V',
    vu.specsK.join(' / ') + '  ·  ' + vu.specsV.join(' / '));
  c.T('chaque point fort existant a sa ligne',
    vu.feats.length === 2 && vu.feats[0] === 'Premier point fort', vu.feats.join(' | '));
  c.T('tous les visuels sont montrés, dans l\'ordre du catalogue',
    vu.visuels.length === 2 && vu.visuels[1] === 'images/placeholder.svg',
    vu.visuels.length + ' visuel(s)');
  c.T('on peut ajouter PLUSIEURS visuels d\'un coup',
    vu.ajoutMultiple === true, vu.ajoutMultiple ? 'champ multiple' : 'un seul fichier à la fois');

  /* ⛔ L'ASSERTION QUI DÉFEND UNE RÈGLE PRODUIT, PAS UNE FORME. */
  c.T('⛔ AUCUN champ de PRIX dans ce panneau — « plus aucun prix n\'est saisi à la main »',
    vu.champPrix === 0, vu.champPrix + ' champ(s) de prix trouvé(s)');

  c.T('aucun élément muet : chacun porte un texte, un aria-label ou un <label>',
    vu.sansNom.length === 0,
    vu.sansNom.length ? vu.sansNom.join(', ') : 'tous nommés');
  c.T('aucune erreur JavaScript pendant le rendu',
    erreurs.length === 0, erreurs.length ? erreurs.join(' | ') : 'aucune');

  await page.locator('#__admFiche').screenshot({ path: join(RACINE, 'tests', '_sortie', 'admin-fiche.png') });
  await ctx.close();
} finally {
  await nav.close();
  await s.fermer();
}

c.terminer();
