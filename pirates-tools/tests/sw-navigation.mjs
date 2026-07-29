/* tests/sw-navigation.mjs — LE DERNIER RECOURS DU SERVICE WORKER.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE HARNAIS EXISTE
   Le 29/07/2026, pirates-tools.com ne s'ouvrait plus : page noire, chargement
   sans fin, AUCUN bouton « Recharger » (le watchdog de index.html ne partait
   même pas — le HTML n'arrivait jamais). Au même instant ish-ebon.vercel.app
   fonctionnait, avec EXACTEMENT les mêmes fichiers et le même déploiement.

   La seule chose qui diffère entre ces deux adresses, c'est l'ORIGINE — et un
   Service Worker est enregistré PAR ORIGINE.

   LE DÉFAUT, reproduit ici :
       return Response.redirect('./', 302);   // ancien « dernier recours »
   Pour une navigation vers `/`, `./` résout vers… `/`. La page se redirigeait
   VERS ELLE-MÊME. Mesuré : net::ERR_TOO_MANY_REDIRECTS.

   ⚠️ DEUX PIÈGES DE MESURE RENCONTRÉS EN ÉCRIVANT CE HARNAIS — à ne pas
   refaire, ils rendaient le test FAUSSEMENT VERT :
   1. `context.route(..., r => r.abort())` n'intercepte PAS les requêtes émises
      DEPUIS le Service Worker. Le réseau restait donc ouvert pour lui et le
      dernier recours n'était jamais atteint. On éteint le VRAI serveur.
   2. Lire `document.body.innerText` juste après `waitUntil:'commit'` renvoie
      une chaîne vide : la page vient de s'engager, elle n'est pas parsée. On
      attend `domcontentloaded`.

   ⛔ Ce harnais ne cherche aucune chaîne de caractères ni numéro de ligne. Il
   fait tourner le VRAI Service Worker dans un VRAI navigateur et observe ce
   que le navigateur en fait. Toute réécriture du dernier recours reste couverte.
   ───────────────────────────────────────────────────────────────────────── */
import { playwright, optionsNavigateur, serveur, compteur } from './_socle.mjs';

const c = compteur('sw-navigation — le dernier recours ne doit jamais boucler');
const pw = await playwright();
const nav = await pw.chromium.launch(optionsNavigateur());
let s = await serveur();

try {
  const ctx = await nav.newContext({ serviceWorkers: 'allow' });
  const page = await ctx.newPage();

  /* ── 1. Le Service Worker prend la main ───────────────────────────────── */
  await page.goto(s.base + '/', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const etat = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'pas-de-support';
    const r = await navigator.serviceWorker.ready.catch(() => null);
    return r && r.active ? 'actif' : 'absent';
  });

  // Sans Service Worker actif, ce harnais ne mesure RIEN : il serait vert à vide.
  if (!c.prealable('le Service Worker s\'enregistre et devient actif',
      etat === 'actif', 'état=' + etat)) throw new Error('préalable');

  /* ── 2. On reproduit l'état exact de la panne ─────────────────────────── */
  // (a) caches vides — c'est l'état d'une navigation privée, ou d'un
  //     déploiement tout juste publié dont le shell n'est pas encore stocké.
  const restants = await page.evaluate(async () => {
    const n = await caches.keys();
    await Promise.all(n.map((k) => caches.delete(k)));
    return (await caches.keys()).length;
  });
  c.T('les caches peuvent être entièrement vidés (état « navigation privée »)',
    restants === 0, restants + ' cache(s) restant(s)');

  // (b) réseau réellement injoignable. On éteint le serveur : c'est la seule
  //     coupure que le Service Worker subit vraiment (voir piège n°1 en tête).
  const base = s.base;
  s.fermer(); s = null;
  await new Promise((r) => setTimeout(r, 400));

  /* ── 3. LA MESURE ─────────────────────────────────────────────────────── */
  let verdict = 'inconnu', detail = '', page2 = null;
  try {
    const rep = await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    verdict = 'reponse';
    detail = 'HTTP ' + (rep ? rep.status() : '?');
    page2 = await page.evaluate(() => ({
      texte: ((document.body && document.body.innerText) || '').trim(),
      sortie: !!document.querySelector('a[href], button')
    }));
  } catch (e) {
    const m = String((e && e.message) || e);
    if (/ERR_TOO_MANY_REDIRECTS/.test(m)) { verdict = 'boucle'; detail = 'ERR_TOO_MANY_REDIRECTS'; }
    else if (/[Tt]imeout/.test(m)) { verdict = 'boucle'; detail = 'chargement sans fin (délai dépassé)'; }
    else { verdict = 'erreur'; detail = m.split('\n')[0].slice(0, 110); }
  }

  /* Boucle OU chargement sans fin : même écran pour l'utilisateur — noir, muet,
     sans issue. C'est précisément la panne du 29/07. */
  c.T('une navigation réseau-coupé ne part PAS en boucle de redirection',
    verdict !== 'boucle', 'verdict=' + verdict + ' — ' + detail);

  c.T('le navigateur reçoit bien une réponse à afficher',
    verdict === 'reponse', 'verdict=' + verdict + ' — ' + detail);

  /* ── 4. Et cette réponse doit être UTILISABLE ─────────────────────────── */
  // Une page morte muette est le pire résultat possible : l'utilisateur ne sait
  // ni ce qui se passe, ni quoi faire, et rien ne remonte pour le diagnostic.
  c.T('la page de secours explique la situation en toutes lettres',
    !!page2 && page2.texte.length > 30,
    page2 ? JSON.stringify(page2.texte.slice(0, 80)) : 'aucune page rendue');

  c.T('la page de secours offre une sortie (lien ou bouton), jamais un cul-de-sac',
    !!page2 && page2.sortie, page2 ? (page2.sortie ? 'présente' : 'AUCUNE') : 'aucune page rendue');

  c.T('elle est rédigée en français, comme le reste du site',
    !!page2 && /connexion|réessa|hors ligne/i.test(page2.texte),
    page2 ? JSON.stringify(page2.texte.slice(0, 60)) : '—');

  await ctx.close();
} finally {
  await nav.close();
  if (s) s.fermer();
}

c.terminer();
