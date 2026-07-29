/* tests/mfa-cle-largeur.mjs — LA CLÉ TOTP DOIT TENIR DANS L'ÉCRAN.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE HARNAIS EXISTE
   Constaté par l'user le 29/07/2026, au moment d'activer sa double
   authentification : la clé sortait de l'écran de son iPad, écrite en très
   gros, sans passer à la ligne.

   LA CAUSE ÉTAIT UN COPIER-COLLER DE STYLE. La clé réutilisait
   `.lv-handcode__num`, une classe taillée pour le code de remise d'une
   livraison — **6 chiffres**, à `1.9rem` avec `0.35em` d'interlettrage. Une
   clé TOTP en fait **32**. À cette taille, 32 caractères réclament plus de
   1 000 px, et aucune règle ne les autorisait à se couper.

   ⚠️ CE QUE CE HARNAIS MESURE : le DÉBORDEMENT RÉEL, pas la présence d'une
   propriété CSS. Chercher `word-break` dans la feuille de style ne prouverait
   rien — une règle plus spécifique pourrait l'annuler. On rend le texte dans
   un vrai navigateur, aux largeurs réelles des appareils de l'user, et on
   compare la largeur RENDUE de la clé à la largeur de l'ÉCRAN.

   ⛔ Le harnais ne teste PAS une clé écrite en dur : il en fabrique une de
   32 caractères, longueur imposée par la norme TOTP. Le jour où la clé
   change, la mesure reste valable.
   ───────────────────────────────────────────────────────────────────────── */
import { playwright, optionsNavigateur, serveur, couperLeTiers, compteur } from './_socle.mjs';

const c = compteur('mfa-cle-largeur — la clé TOTP ne déborde jamais');
const s = await serveur();
const pw = await playwright();
const nav = await pw.chromium.launch(optionsNavigateur());

/* Largeurs réelles, pas des valeurs choisies pour arranger la mesure.
   L'user travaille sur iPad : c'est 820 en portrait qui compte le plus. */
const ECRANS = [
  { nom: 'iPhone étroit', w: 375, h: 812 },
  { nom: 'iPad portrait', w: 820, h: 1180 },
  { nom: 'iPad paysage', w: 1180, h: 820 }
];

// 32 caractères base32 — la longueur qu'impose la norme TOTP.
const CLE = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

try {
  const ctx = await nav.newContext();
  await couperLeTiers(ctx);
  const page = await ctx.newPage();
  await page.goto(s.base + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  // Sans la feuille de style chargée, toute mesure serait fantaisiste.
  const cssOk = await page.evaluate(() =>
    [...document.styleSheets].some((f) => (f.href || '').indexOf('styles.css') !== -1));
  if (!c.prealable('la feuille de style du site est bien chargée', cssOk,
      cssOk ? 'styles.css présente' : 'AUCUNE feuille styles.css')) throw new Error('préalable');

  for (const e of ECRANS) {
    await page.setViewportSize({ width: e.w, height: e.h });

    const m = await page.evaluate((cle) => {
      // On reproduit EXACTEMENT le balisage de mfa.js : la classe seule ne
      // suffit pas, c'est le conteneur qui borne la largeur disponible.
      /* ⚠️ Hôte NORMAL dans le flux, pas `position:fixed` : un élément fixe ne
         participe pas au débordement du document, la seconde mesure serait
         donc toujours verte. */
      const hote = document.createElement('div');
      hote.style.cssText = 'width:100%;padding:0 1rem;box-sizing:border-box';
      hote.innerHTML = '<div class="lv-handcode__row">'
        + '<span class="lv-handcode__key">Ta clé</span>'
        + '<strong class="mfa-cle" id="__cle">' + cle + '</strong></div>';
      document.body.appendChild(hote);
      const el = document.getElementById('__cle');
      const st = getComputedStyle(el);
      /* ⚠️ ON NE COMPARE PAS scrollWidth À clientWidth. Ce fut ma première
         mesure, et elle ne pouvait RIEN détecter : un <strong> grandit avec
         son contenu, donc ses deux largeurs sont toujours égales. Sous
         sabotage — clé de 1064 px sur un écran de 375 — le harnais restait
         VERT. Un détecteur faussement vert est pire que pas de détecteur.
         La référence, c'est la LARGEUR DE L'ÉCRAN. */
      const ecran = document.documentElement.clientWidth;
      const boite = el.getBoundingClientRect();
      const r = {
        ecran: ecran,
        debordeElement: boite.width > ecran,
        debordePage: document.documentElement.scrollWidth > ecran + 1,
        largeurTexte: Math.round(boite.width),
        taille: st.fontSize,
        lignes: Math.round(boite.height / parseFloat(st.lineHeight || '20'))
      };
      hote.remove();
      return r;
    }, CLE);

    c.T('la clé tient dans sa boîte sur ' + e.nom + ' (' + e.w + ' px)',
      !m.debordeElement, 'clé ' + m.largeurTexte + ' px pour un écran de ' + m.ecran
      + ' px · police ' + m.taille + ' · ' + m.lignes + ' ligne(s)');

    /* ⚠️ ASSERTION FAIBLE, ET C'EST DIT. Sous le sabotage de référence (clé de
       1064 px sur un écran de 375), celle-ci est restée VERTE : le conteneur
       en `flex-wrap` absorbe le dépassement sans étendre le document. Elle ne
       protège donc PAS à elle seule — c'est l'assertion ci-dessus qui tient.
       On la garde parce qu'elle attraperait un débordement d'une autre nature,
       mais personne ne doit s'y fier. */
    c.T('elle ne fait pas défiler la page horizontalement sur ' + e.nom,
      !m.debordePage, m.debordePage ? 'DÉBORDEMENT de la page' : 'aucun débordement');
  }

  await ctx.close();
} finally {
  await nav.close();
  s.fermer();
}

c.terminer();
