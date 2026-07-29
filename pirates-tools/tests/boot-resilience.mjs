/* tests/boot-resilience.mjs — LE DÉMARRAGE NE DOIT JAMAIS DÉPENDRE DES
   DONNÉES DÉJÀ STOCKÉES SUR L'APPAREIL.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE HARNAIS EXISTE
   Panne du 29/07/2026 : le site était mort sur pirates-tools.com et vivant sur
   ish-ebon.vercel.app — mêmes fichiers, même déploiement. Tout ce qui diffère
   entre deux adresses est stocké PAR ORIGINE : Service Worker (traité par
   tests/sw-navigation.mjs) et **stockage local**.

   Le domaine accumule des clés depuis des mois ; l'adresse Vercel est vierge.
   Une seule valeur illisible qui ferait échouer le démarrage produirait donc
   exactement l'asymétrie observée — et serait invisible sur un navigateur neuf,
   donc invisible de tous les autres harnais.

   ⚠️ CE QUI EST MESURÉ, ce n'est pas « aucune exception » mais **PT_BOOTED**,
   le drapeau que app.js pose à la toute fin de son initialisation. C'est la
   seule preuve que l'application est réellement allée au bout : une erreur
   avalée en silence à mi-parcours laisserait un écran noir tout en produisant
   zéro exception visible.

   ⛔ Ce harnais ne nomme aucune clé « attendue » : il lit les clés que le site
   écrit RÉELLEMENT pendant une visite, puis les empoisonne. Le jour où une
   nouvelle clé apparaît, elle est couverte sans qu'on touche à ce fichier.
   ───────────────────────────────────────────────────────────────────────── */
import { playwright, optionsNavigateur, serveur, couperLeTiers, compteur } from './_socle.mjs';

const c = compteur('boot-resilience — un stockage local abîmé ne doit pas tuer le site');
const s = await serveur();
const pw = await playwright();
const nav = await pw.chromium.launch(optionsNavigateur());

/** Ouvre le site et rend l'état réel du démarrage. */
async function demarrer(ctx, avant) {
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e).split('\n')[0].slice(0, 120)));
  if (avant) await page.addInitScript(avant);
  await page.goto(s.base + '/?b=' + Math.floor(performance.now()), { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const vu = await page.evaluate(() => ({
    booted: !!window.PT_BOOTED,
    watchdog: !!document.getElementById('ptBootWatchdog'),
    cles: Object.keys(localStorage),
    // « du contenu à l'écran » : au moins un titre et un élément cliquable.
    contenu: (document.body.innerText || '').trim().length
  }));
  vu.erreurs = erreurs;
  await page.close();
  return vu;
}

try {
  const ctx = await nav.newContext();
  await couperLeTiers(ctx);

  /* ── 1. Référence : un appareil vierge ────────────────────────────────── */
  const neuf = await demarrer(ctx, null);

  // Sans démarrage de référence, tout le reste du harnais ne compare rien.
  if (!c.prealable('le site démarre sur un appareil vierge (PT_BOOTED posé)',
      neuf.booted, 'booted=' + neuf.booted + ' erreurs=' + (neuf.erreurs[0] || 'aucune'))) {
    throw new Error('préalable');
  }
  c.T('aucun watchdog ne se déclenche sur un démarrage sain',
    !neuf.watchdog, neuf.watchdog ? 'watchdog VISIBLE' : 'absent');

  const cles = neuf.cles;
  c.T('le site écrit bien des clés dans le stockage local (sinon rien à empoisonner)',
    cles.length > 0, cles.length + ' clé(s) : ' + cles.slice(0, 6).join(', '));

  /* ── 2. Poison n°1 : des valeurs qui ne sont pas du JSON ──────────────── */
  const poison = (valeur) => ({
    content: 'try{' + cles.map((k) =>
      `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(valeur)});`).join('') + '}catch(e){}'
  });

  const casse = await demarrer(ctx, poison('{{{ pas du json'));
  c.T('le site démarre malgré des valeurs illisibles dans le stockage local',
    casse.booted, 'booted=' + casse.booted + ' · ' + (casse.erreurs[0] || 'aucune erreur JS'));
  c.T('et il affiche quand même du contenu, pas un écran vide',
    casse.contenu > 200, casse.contenu + ' caractères à l\'écran');

  /* ── 3. Poison n°2 : du JSON valide mais du MAUVAIS TYPE ─────────────── */
  // Le piège classique : `JSON.parse` réussit, et c'est la LIGNE D'APRÈS qui
  // casse (`.length` sur un nombre, `.forEach` sur un objet). Un try/catch
  // autour du parse seul ne protège de rien.
  const typeFaux = await demarrer(ctx, poison('12345'));
  c.T('le site démarre malgré un stockage local du mauvais TYPE (JSON valide, forme inattendue)',
    typeFaux.booted, 'booted=' + typeFaux.booted + ' · ' + (typeFaux.erreurs[0] || 'aucune erreur JS'));

  /* ── 4. Poison n°3 : le stockage local refuse d'écrire ───────────────── */
  // Safari en navigation privée, ou quota dépassé : setItem lève. C'est le cas
  // de l'user, qui navigue TOUJOURS en privé.
  const bloque = await demarrer(ctx, {
    content: 'try{Object.defineProperty(Storage.prototype,"setItem",{value:function(){throw new Error("QuotaExceededError");}});}catch(e){}'
  });
  c.T('le site démarre quand le stockage local REFUSE toute écriture (Safari privé, quota)',
    bloque.booted, 'booted=' + bloque.booted + ' · ' + (bloque.erreurs[0] || 'aucune erreur JS'));

  /* ── 5. Le filet : quand le démarrage échoue, ça doit SE VOIR ─────────── */
  // On casse app.js volontairement. Sans ce contrôle, on ne saurait pas si le
  // watchdog protège encore quoi que ce soit.
  // ⚠️ Contexte NEUF et Service Worker INTERDIT : sans ça, le SW enregistré par
  //    les étapes précédentes sert app.js depuis son cache, l'app démarre, et
  //    l'absence de watchdog est parfaitement normale — on croirait à un défaut
  //    du filet alors qu'on n'a rien cassé du tout.
  const ctxNu = await nav.newContext({ serviceWorkers: 'block' });
  const page = await ctxNu.newPage();
  await page.route('**/app.js*', (r) => r.abort());
  await page.goto(s.base + '/?b=watchdog', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9500);
  const filet = await page.evaluate(() => {
    const d = document.getElementById('ptBootWatchdog');
    return { booted: !!window.PT_BOOTED, present: !!d,
             texte: d ? (d.innerText || '').trim().slice(0, 90) : '',
             bouton: !!(d && d.querySelector('button')) };
  });
  await page.close();
  await ctxNu.close();

  // Sans cette vérification, les deux assertions suivantes pourraient être
  // rouges pour la mauvaise raison (app.js a démarré → le filet n'avait pas
  // à se déclencher). On prouve d'abord qu'on a bien cassé le démarrage.
  if (!c.prealable('le démarrage est réellement cassé (PT_BOOTED absent)',
      !filet.booted, 'booted=' + filet.booted)) throw new Error('préalable');

  c.T('app.js absent → le watchdog s\'affiche au lieu d\'une page noire muette',
    filet.present, filet.present ? JSON.stringify(filet.texte) : 'AUCUN watchdog');
  c.T('le watchdog propose un bouton, pas seulement un message',
    filet.bouton, filet.bouton ? 'bouton présent' : 'AUCUN bouton');

  await ctx.close();
} finally {
  await nav.close();
  s.fermer();
}

c.terminer();
