/* tests/raz-deux-clics.mjs — UN EFFACEMENT NE PART JAMAIS SUR UN SEUL CLIC.
   ─────────────────────────────────────────────────────────────────────────
   POURQUOI CE HARNAIS EXISTE

   Demandé par l'user le 01/08/2026, en même temps que le bouton lui-même :
   « fais attention quand tu crées le bouton de remise à zéro de l'historique
   dans la partie compte et ça pour tous les Client que ça se passe bien en
   deux clics, je clique qu'une première fois une fenêtre de confirmation
   s'ouvre et je reconfirme pour ne pas faire d'erreur ».

   Un bouton destructeur mal gardé ne se voit pas à la relecture : il se voit
   le jour où quelqu'un a effacé quelque chose. Il n'y a pas de deuxième
   chance à ce moment-là, donc la garde se prouve AVANT.

   ─────────────────────────────────────────────────────────────────────────
   CE QUE CE HARNAIS MESURE — ET CE QU'IL REFUSE DE MESURER

   ⛔ Il ne compte PAS les `window.confirm` dans le source. Ce serait vérifier
      la forme du code, pas le comportement : deux appels peuvent très bien
      être écrits et la requête partir quand même (branche mal fermée, `return`
      oublié, écouteur posé deux fois).

   ✅ Il fait l'inverse : il pilote un VRAI navigateur, répond aux VRAIES
      fenêtres de confirmation, et regarde la seule chose qui compte —
      **la requête réseau est-elle partie ?**

   Trois parcours, un seul doit aboutir :
      ① je refuse la première fenêtre       → 0 requête
      ② j'accepte la 1re, je refuse la 2e   → 0 requête
      ③ j'accepte les deux                  → 1 requête, et une seule

   ⚠️ Le parcours ③ est indispensable. Sans lui, un bouton complètement mort
   passerait ① et ② les doigts dans le nez : zéro requête, deux fois. Un
   harnais qui ne vérifie que l'abstention est vert sur un bouton débranché.
   ───────────────────────────────────────────────────────────────────────── */
import { playwright, optionsNavigateur, serveur, couperLeTiers, compteur } from './_socle.mjs';

const c = compteur('raz-deux-clics — l\'effacement exige deux confirmations');
const s = await serveur();
const pw = await playwright();
const nav = await pw.chromium.launch(optionsNavigateur());

const BOUTON = '#accRazHisto';
const TYPE = 'raz-mon-historique';

/* Ouvre une page neuve, clique le bouton, et répond aux fenêtres selon
   `reponses` (`true` = j'accepte, `false` = je refuse). Rend le nombre de
   fenêtres réellement ouvertes et le nombre de requêtes d'effacement parties.

   ⚠️ Une page NEUVE par parcours : réutiliser la même laisserait l'état du
   parcours précédent (bouton désactivé, texte « Nettoyage… ») fausser le
   suivant — et un bouton désactivé n'ouvre plus rien, donc le parcours ③
   verdirait pour la mauvaise raison. */
async function parcours(ctx, reponses) {
  const page = await ctx.newPage();
  let fenetres = 0;
  const requetes = [];

  page.on('dialog', async (d) => {
    const veut = reponses[fenetres];
    fenetres += 1;
    if (veut === true) await d.accept();
    else await d.dismiss();
  });

  /* On INTERCEPTE au lieu de laisser passer : le serveur statique du socle
     n'a pas d'API, la requête finirait en 404 et le comptage dépendrait d'un
     hasard de routage. Ici elle est comptée puis répondue proprement. */
  await page.route('**/api/contact*', async (r) => {
    let corps = {};
    try { corps = JSON.parse(r.request().postData() || '{}'); } catch (_) {}
    if (corps.type === TYPE) requetes.push(corps);
    await r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, commandes: [] }) });
  });

  await page.goto(s.base + '/index.html#/compte', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const el = await page.$(BOUTON);
  if (el) {
    /* Le bouton vit dans un onglet masqué : `click()` refuserait sur un
       élément non visible. On déclenche l'événement que l'écouteur écoute —
       c'est le MÊME chemin de code qu'un vrai doigt sur l'iPad. */
    await page.evaluate((sel) => document.querySelector(sel).click(), BOUTON);
    await page.waitForTimeout(700);
  }
  await page.close();
  return { existe: !!el, fenetres, requetes };
}

try {
  const ctx = await nav.newContext();
  await couperLeTiers(ctx);

  // ── Préalable : sans bouton branché, tout ce qui suit serait du vent. ──
  const sonde = await parcours(ctx, [false]);
  if (!c.prealable('le bouton de remise à zéro existe dans la page',
      sonde.existe, sonde.existe ? BOUTON + ' présent' : BOUTON + ' INTROUVABLE')) {
    throw new Error('préalable');
  }
  if (!c.prealable('un clic ouvre bien une fenêtre de confirmation',
      sonde.fenetres >= 1, sonde.fenetres + ' fenêtre(s)')) throw new Error('préalable');

  // ① Je refuse la première fenêtre : rien ne doit partir.
  c.T('premier refus : aucune requête d\'effacement ne part',
    sonde.requetes.length === 0, sonde.requetes.length + ' requête(s)');
  c.T('premier refus : la seconde fenêtre ne s\'ouvre même pas',
    sonde.fenetres === 1, sonde.fenetres + ' fenêtre(s) ouverte(s)');

  // ② J'accepte, puis je me ravise : rien ne doit partir non plus.
  const b = await parcours(ctx, [true, false]);
  c.T('deuxième fenêtre bien ouverte après le premier accord',
    b.fenetres === 2, b.fenetres + ' fenêtre(s)');
  c.T('refus à la seconde fenêtre : aucune requête d\'effacement ne part',
    b.requetes.length === 0, b.requetes.length + ' requête(s)');

  // ③ J'accepte les deux : une requête, et une seule.
  const d = await parcours(ctx, [true, true]);
  c.T('double accord : exactement une requête d\'effacement part',
    d.requetes.length === 1, d.requetes.length + ' requête(s)');
  c.T('la requête porte bien le type d\'effacement attendu',
    d.requetes.length === 1 && d.requetes[0].type === TYPE,
    d.requetes.length ? String(d.requetes[0].type) : 'aucune');
  /* ⛔ Le client ne dit PAS au serveur quel compte vider ni depuis quand :
     l'uid vient du jeton vérifié, la date est posée par le serveur. Un champ
     d'identité ou de date dans le corps serait une prise pour vider le compte
     d'un autre — ou pour se fabriquer un historique. */
  c.T('la requête ne porte ni identité ni date choisies par le client',
    d.requetes.length === 1
      && !('uid' in d.requetes[0]) && !('email' in d.requetes[0])
      && !('historiqueMasqueAvant' in d.requetes[0]) && !('avant' in d.requetes[0]),
    d.requetes.length ? Object.keys(d.requetes[0]).join(',') : 'aucune');
} catch (e) {
  if (String(e.message) !== 'préalable') {
    c.T('le harnais va au bout sans exception', false, String(e && e.message || e));
  }
} finally {
  await nav.close();
  await s.fermer();
}

export default c.bilan();
if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = c.echecs ? 1 : 0;
