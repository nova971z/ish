---
paths:
  - pirates-tools/app.js
  - pirates-tools/styles.css
  - pirates-tools/index.html
  - pirates-tools/sw.js
  - pirates-tools/vercel.json
---

# Règles du front — Service Worker, CSP, budgets

*Extraites de la mémoire projet le 29/07/2026 (`docs/EXTRACTION-REGLES.md`,
groupes C, D, I-perf). Chacune vient d'une panne réellement vécue.*

## Service Worker

**Un dernier recours ne renvoie JAMAIS de redirection.** Il rend une page
autonome, lisible, avec une sortie. `Response.redirect('./')` sur une
navigation vers `/` redirige la page **vers elle-même** : boucle infinie, aucun
octet de HTML rendu, aucun script exécuté, aucun watchdog. Site entièrement
mort, sans message. *(Panne du 29/07/2026, reproduite : `ERR_TOO_MANY_REDIRECTS`.)*

**Le Service Worker ne touche JAMAIS `/api/`.** Ces réponses sont dynamiques et
authentifiées : les mettre en cache sert des données périmées (admin, comptes,
prix). Les laisser sortir au réseau, sans intermédiaire.

**Jamais de corps de réponse vide.** Un `new Response('')` fait échouer le
`.json()` de l'appelant, et Safari ne remonte qu'un `TypeError` opaque, sans
URL ni cause. Répondre une erreur **lisible**, adaptée au type demandé.

**Jamais réutiliser un numéro de version.** Deux contenus différents publiés
sous le même numéro produisent un mélange de fichiers périmés et frais,
impossible à diagnostiquer. `VERSION`, `ASSET_VER` et les `?v=` de `index.html`
doivent rester alignés — la CI le vérifie (`check-asset-versions`).

**Un Service Worker corrigé ne prend la main qu'au rechargement SUIVANT.**
Toujours faire recharger **deux fois** avant de conclure qu'un correctif n'a
pas marché.

**Une réponse 5xx ne remplace jamais un shell en cache.** Une panne serveur
n'est pas une réponse. Un 404, en revanche, reste un 404 : c'est une
information, on ne la masque pas.

## CSP

**Un site 3D exige `worker-src 'self' blob:` et `'wasm-unsafe-eval'.** Les
`.glb` compressés Draco se décodent dans un Web Worker créé depuis un `blob:`,
avec du WASM. Sans ces deux autorisations : zéro modèle rendu.

**Les textures embarquées exigent `blob:` dans `connect-src` ET `img-src`.**
three.js décode les textures WebP en créant une URL `blob:` chargée par
`fetch()`. Sans ça : géométrie correcte, surfaces blanches.

**Modifier un script inline change son empreinte.** Les trois scripts inline de
`index.html` sont autorisés par empreinte `sha256` dans `vercel.json`. Après
toute modification : `node scripts/check-csp.js`, puis reporter le nouveau
hash. Sans ça, la CSP **bloque le script en production** et le site est mort.

## Budgets de performance

**Les plafonds ne se relèvent pas.** Quand `scripts/ci.js` bloque, on retire du
poids — on ne déplace pas la limite.

**Avant toute purge CSS, vérifier les classes construites par concaténation.**
`'toast--' + type`, `abo-page--*`, `plan-detail--*`, `partner-card--*`,
`stock-badge--*`, `lv-tarif--z*`, `admin-app--*`, `page-*` n'apparaissent
jamais littéralement dans le code, et `leaflet-container` est posée par Leaflet.
Elles semblent mortes et ne le sont pas.
