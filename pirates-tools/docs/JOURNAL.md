# JOURNAL DU PROJET — copie intégrale de la mémoire au 29/07/2026

> Ce fichier est la copie VERBATIM de CLAUDE.md avant sa restructuration.
> Il existe pour une seule raison : garantir que le découpage ne perd RIEN.
> Aucune ligne ne sera jamais supprimée ici.

# Mémoire projet — Pirates Tools (e-commerce PWA)

Travail actif : `pirates-tools/` (PWA vanilla HTML/CSS/JS, API serverless Vercel + Firebase + Stripe).
Branche de dev : `claude/pirates-tools-rebuild-zWc1b`. Prod = Vercel, domaine perso `pirates-tools.com`.

## 🧭 CONTEXTE DE L'USER — GRAVÉ (lire AVANT tout diagnostic le concernant)
Trois faits qui invalident la moitié des diagnostics par défaut. Ignorés le
29/07/2026, ils lui ont coûté une nuit entière.
- **L'USER EST AU MAROC.** L'ENTREPRISE est en Guadeloupe (fiscalité, octroi de
  mer, livraisons), **lui non**. ⛔ Ne JAMAIS déduire sa localisation de celle
  de la société : c'est l'erreur exacte commise cette nuit-là, et elle a orienté
  tout un diagnostic réseau dans la mauvaise direction.
- **NAVIGATION PRIVÉE EXCLUSIVE, sur iPad + Safari.** Conséquences qui doivent
  être appliquées, pas seulement connues : **AUCUN Service Worker n'est
  enregistré** (iOS les désactive en privé), **aucun cache ne persiste**,
  **`localStorage` est vidé entre deux visites**. ⛔ Donc : aucun diagnostic le
  concernant ne peut reposer sur le SW, sur un cache, ou sur une donnée
  stockée ; et « efface les données de site » est une consigne VIDE de sens
  pour lui. Tout chargement chez lui est un **chargement à froid intégral** —
  seul le poids brut compte, le cache ne l'aide jamais.
- **PAS DE TÉLÉPHONE, PAS DE DONNÉES CELLULAIRES.** Tout est sur l'iPad. ⛔ Ne
  jamais proposer « teste en 4G », ni un QR à scanner depuis un autre appareil
  (un écran ne se scanne pas lui-même → la clé TOTP en toutes lettres est LE
  chemin, pas un repli).

## 🌐 PANNE DU 29/07/2026 — LE DOMAINE POINTAIT SUR DES IP VERCEL INJOIGNABLES
Site totalement inaccessible sur `pirates-tools.com` (page noire, chargement
sans fin, aucun bouton) pendant que `ish-ebon.vercel.app` fonctionnait. **Ni le
code, ni le déploiement, ni Cloudflare n'étaient en cause** — CI verte, Vercel
« Ready », 0 % d'erreur, aucun fichier servi modifié depuis des jours.
- **CAUSE** : l'apex pointait sur la **nouvelle cible Vercel**
  `d8bfe7610bcdbce8.vercel-dns-017.com` → `64.29.17.65` / `216.198.79.65`. Ces
  IP ne répondaient pas depuis son opérateur marocain. Problème **connu et
  récurrent** : les nouvelles plages Vercel (`216.198.79.x`, `64.29.17.x`) sont
  régulièrement blackholées par certains opérateurs — cas identiques signalés
  depuis le Brésil (AS28668), Oman (AS204170), la Corée du Sud. Rien n'apparaît
  jamais sur le statut Vercel : la coupure est dans le chemin réseau, pas chez eux.
- **CORRECTIF APPLIQUÉ** : apex ET `www` repointés sur l'**ancienne cible**
  `cname.vercel-dns.com` (plages `66.33.60.x` / `76.76.21.x`, non touchées),
  puis **proxy Cloudflare ACTIVÉ (nuage orange)** sur les deux → le trafic passe
  par le PoP de Casablanca (`104.21.19.232` / `172.67.190.117`). Résultat
  constaté par l'user : « ça marche, c'est même plus rapide qu'avant ».
- ⚠️ **`www` reste branché en Production** (et non en redirection 308) : deux
  chemins indépendants vers le site. C'est ce qui a permis de diagnostiquer.
- ⚠️ **Conséquences du proxy Cloudflare, à ne pas prendre pour des pannes** :
  Vercel peut afficher « Invalid Configuration » (il voit des IP Cloudflare) =
  **cosmétique** ; et si un déploiement ne s'affiche pas, c'est le cache
  Cloudflare → **Caching → Purge Everything**.
- **MÉTHODE À RÉUTILISER** : comparer ce que résolvent les différentes adresses
  d'un même projet. `pirates-tools.com`, `www.pirates-tools.com` et
  `ish-ebon.vercel.app` pointaient sur **trois réseaux différents** — c'est cette
  mesure, et elle seule, qui a désigné la cause après cinq hypothèses fausses.
- ⛔ **LEÇON DE MÉTHODE** : le watchdog de `index.html` est inline et fonctionne
  (prouvé). **Son absence à l'écran signifie que le HTML n'est jamais arrivé** —
  donc que `app.js` n'a même pas été téléchargé, donc qu'aucune relecture de
  code ne peut expliquer la panne. Ce raisonnement aurait fait gagner des heures.

## 🗺️ CARTOGRAPHIE DU CODE — LIRE EN PREMIER (source de vérité TECHNIQUE)
`pirates-tools/docs/CARTOGRAPHIE.md` = carte complète du site (où est quoi, comment
c'est fait) avec numéros de ligne : index.html (vues/routes), app.js (zones + toutes
les fonctions), styles.css (sections/tokens/z-index), api/ (12 endpoints + 16 modules
_lib), Firestore (collections/règles), CI, products.json, env vars, flux critiques,
et surtout une section **⚠️ PIÈGES À NE PAS OUBLIER**. Avant de travailler sur le code,
CONSULTER cette carte pour aller droit à la source. La mettre à jour si la structure change.

## 💼 MÉTHODE D'ENTREPRISE & FISCALITÉ — LIRE AVANT TOUTE QUESTION D'ARGENT
`pirates-tools/docs/METHODE-ENTREPRISE-FISCALITE.md` = **source de vérité
fiscale**. Statut GRAVÉ : **SASU à l'IS, assujettie à la TVA au RÉEL NORMAL
(CA3 mensuelle), établie en Guadeloupe. AUCUNE franchise en base** (refusée par
l'user : « mon site est ma marque »). Contient : taux TVA DOM/IS 2026, circuit
complet de la TVA (exonération art. 294 CGI métropole→DOM, autoliquidation à
l'import obligatoire depuis 2022 = zéro avance en douane, crédit de TVA
structurel remboursable mensuellement dès 760 €), ce que le moteur de prix
prend en compte, les angles morts, et les sources officielles.
⛔ RÈGLE USER (26/07/2026) : **ne JAMAIS répondre « demande à ton comptable »**
sur un point fiscal factuel — tout est public, le chercher aux sources
officielles (impots.gouv.fr, douane.gouv.fr, BOFiP), le donner sourcé et daté,
et l'AJOUTER à ce fichier. Le comptable ne servira qu'à la validation
juridique, jamais à la gestion des comptes.

## Exigence qualité (non négociable)
Code de niveau ingénieur web senior, standard des grandes institutions e-commerce.
Aucun hasard, aucun bullshit. Chaque correction est vérifiée dans le code avant d'être livrée.

## 🛒 RÈGLES PRODUITS / POSTERS — GRAVÉES (source de vérité : `pirates-tools/docs/REGLES-PRODUITS.md`)
LIRE CE FICHIER avant d'ajouter/modifier un produit ou un poster. Cœur des règles imposées par l'user (23/07/2026) :
- **PRIX** : `price` (TTC affiché) = **prix TTC source × 1,15** (marge 15 % SUR le TTC) ; `price_ht` = price / 1,20.
- **PROMOS — RÈGLE MISE À JOUR (24/07, décision user)** : le **traqueur de prix** (auto, 2×/jour) PREND le **prix affiché, promo comprise** → on reste compétitif, et ça se réajuste tout seul quand la promo finit (la marge 15 % reste calée sur le coût RÉEL du jour, car si cotébrico solde, l'user achète soldé aussi). L'ancienne « promos interdites » valait pour la saisie MANUELLE d'un prix figé ; dès qu'un produit est couvert par le traqueur, la promo est OK. ⛔ Un « prix conseillé »/MSRP gonflé ≠ prix source → toujours le vrai prix cotébrico. Prix crédible DOM-TOM.
- **PLUS AUCUN PRIX SAISI À LA MAIN (décision user 26/07/2026)** : tout passe par
  le calculateur (admin → Recalculer). Coût d'achat résolu dans cet ordre par
  `pwSourceCost` (api/admin.js) : **traqueur** (scan réel) > **fiche**
  (`priceSrcTTC` dans products.json, prix cotébrico relevé à la main) >
  **variante** (garde-fou coffret : coffret = nue **+20 €**, nue = coffret
  **−20 €**, `COFFRET_COST_DELTA`) > **estimé** (dérivé de price_ht, dernier
  recours). L'origine s'affiche dans l'aperçu admin — un « coût estimé » = prix
  bâti sur une supposition, à remplacer par un vrai relevé.
- **🔒 PRIX VERROUILLÉ — `priceLocked: true`** (règle gravée 27/07/2026) : un
  produit portant ce drapeau dans products.json n'est **JAMAIS** recalculé, ni
  par « Appliquer les nouveaux prix », ni par le traqueur. C'est une décision
  commerciale de l'user, pas une lacune : il est donc sorti du décompte des
  « estimés » et affiché à part (🔒) dans le bandeau de santé admin.
  Aujourd'hui **1 seul produit** : `DWST83402-1` (TOUGHSYSTEM 2.0 Trolley) —
  motif user : « il coûte entre 166 € et 200 € selon le site, et le prix on n'y
  touche pas ». Coût fournisseur non relevable (cotébrico ne le vend pas, prix
  très variable d'un revendeur à l'autre) → toute recalculation reposerait sur
  une supposition. ⚠️ Le verrou gèle le prix ACTUELLEMENT SERVI (celui de
  l'override Firestore), pas celui de products.json.
- **POSTERS** : fond sombre obligatoire (jamais blanc — signaler AVANT si fond clair). PNG envoyé = à POSER sur le site (pas à regarder). « Machine seule/outil nu » = pas de batteries sur l'image.
- **WORKFLOW** : travailler DIRECTEMENT sur `master` (commit + push immédiat → Vercel live). CI verte à chaque fois. Identifier le produit par le TITRE de la capture pirates-tools.com.
- Journal des produits validés + prix en attente : voir le fichier REGLES-PRODUITS.md §7.

## ⚠️ PIÈGE SW — le Service Worker ne doit JAMAIS toucher /api/ (27/07/2026, v487-489)
PANNE VÉCUE : admin cassée, « Comptes indisponibles : Type error » et « Config
indisponible : Type error ». Diagnostic long car le message de WebKit ne dit ni
l'URL, ni le code HTTP, ni la cause.
- CAUSE RACINE : l'aiguillage `fetch` du SW ne reconnaissait pas `/api/`. Ces
  requêtes tombaient dans le CAS PAR DÉFAUT qui (1) **mettait en cache** les
  réponses d'API (données admin/compta/prix servies périmées) et (2) renvoyait
  `new Response('', {status:504})` — un CORPS VIDE — au moindre incident réseau.
  Le `.json()` de l'appelant échouait alors, et Safari ne remontait qu'un
  `TypeError: Type error` opaque.
- PREUVE DÉCISIVE (à réutiliser) : le SW n'intercepte QUE les GET
  (`if (!isGET(req)) return;`). Or **100 % des appels cassés étaient des GET**
  (accounting, pricing-config) et **100 % des appels qui marchaient étaient des
  POST** (reprice-all, price-watch). Corrélation parfaite = SW coupable.
- DÉCLENCHEUR : 6 bumps de version en 90 min → caches runtime neufs (donc
  vides) à chaque fois, + navigation privée (caches éphémères) → le repli ne
  trouvait jamais rien et servait le corps vide. En version stable, un cache
  existant masquait le bug depuis toujours.
- ⏳ PIÈGE DE VÉRIFICATION : un SW corrigé ne prend la main qu'au rechargement
  SUIVANT. Après le correctif v487 l'user voyait encore l'erreur — j'ai cru à
  tort m'être trompé de cause. **Toujours faire recharger DEUX fois avant de
  conclure qu'un correctif de SW n'a pas marché.**
- CORRECTIFS : (1) `/api/*` sort direct au réseau, jamais intercepté ni mis en
  cache ; (2) le repli du cas par défaut ne renvoie plus JAMAIS de corps vide
  mais un JSON d'erreur lisible ; (3) `adminGet`/`adminPostType` lisent la
  réponse en texte d'abord et nomment l'échec (HTTP + URL + content-type +
  extrait) ; (4) `/api/health` expose `firebaseCheck` (intégrité du compte de
  service : longueur, parsing, clé privée complète — jamais la valeur).

## 🧹 PURGE CATALOGUE — « seul ce que le traqueur voit reste » (26/07/2026)
RÈGLE ISSUE DE CETTE SESSION : un produit dont le **coût d'achat n'est pas
relevé chez cotébrico** ne reste pas au catalogue — son prix reposerait sur une
supposition et il n'est de toute façon pas approvisionnable. 34 fiches retirées
en 4 vagues : Flex ×2, Facom ×1, Festool SKU inventé ×3 (TI-18, TPC-18, TSC55),
puis **28 fiches « coût estimé »** (15 DeWALT · 9 Makita · 4 Festool · 2 Wera).
Catalogue **510 → 476** (172 vrais produits + 304 quincaillerie).
- ⚠️ EXCEPTION VOULUE : `DWST83402-1` (TOUGHSYSTEM 2.0 Trolley) CONSERVÉ.
- ⚠️ TOUS LES ASSETS SONT CONSERVÉS (posters + 14 modèles 3D, dont les 4 packs
  fusionnés dcf894p2-pack / dcd796p2-pack / dck276p2-pack / dcd996p2-pack).
  Remettre une fiche = la recréer dans products.json, les visuels sont là.
- ⚠️ Deux suppressions CONTREDISENT des décisions antérieures — à re-trancher si
  l'user les redemande : `DUB363ZV` (ajouté sciemment le ~24/07 alors qu'il
  n'est PAS chez cotébrico) et `DCG405FN-XJ` (prix dérivé d'Amazon, validé
  explicitement par l'user le ~20/07). Restaurables via git.
- Wera n'a JAMAIS eu de raccourci traqueur → ses 2 fiches sont parties faute de
  couverture, pas faute d'existence. Créer le raccourci si on les remet.

## 📌 À FAIRE PLUS TARD (en attente, décidé avec l'user — à traiter ensemble)
- [x] **Règles Firestore DÉPLOYÉES ✅ (25/07/2026, ~20h, par l'user via la
      console iPad)** : contenu complet vérifié sur capture (58 lignes = verrou
      anti-fraude S1 + crypto désactivé + analytics fermées + `partners`
      lecture publique Phase 2 + default-deny final). Les règles LIVE = le
      fichier firestore.rules du repo. Si le fichier change à l'avenir →
      re-publier via console (même procédure iPad).
- [ ] **Auth admin mot de passe fort + Google Authenticator (TOTP)** : demandé.
      Nécessite d'activer Identity Platform (console Firebase) + méthode TOTP,
      puis code : écran login admin (email+MDP+défi TOTP+enrôlement QR) et
      serveur exigeant claim admin ET 2e facteur, puis retrait d'ADMIN_SECRET.
      Le socle claim admin existe déjà (H6, set-admin-claim.js).
- [ ] **Tableau de bord admin — stats de visite/clics** : demandé (voir réponse
      donnée). À cadrer : reco = collecte maison (events → Firestore) OU GA4.
      Décision produit + périmètre à trancher avec l'user avant de coder.
- [x] **SKU imprécis — RÉSOLU le 26/07/2026 : Flex et Facom SUPPRIMÉS.** Le
      traqueur a confirmé le diagnostic du 18/07 (ces références n'existent pas
      chez cotébrico → jamais de coût réel possible). Décision user :
      « supprime les produits Flex, on les remettra correctement à l'aide du
      traqueur ; supprime les produits Facom également ». 3 fiches retirées de
      products.json : Flex `FW1/2-502`, Flex `ID1/4-18`, Facom `CL3.C18SP`.
      Catalogue 510 → 507 (203 vrais produits + 304 quincaillerie).
      ⚠️ Les ASSETS sont CONSERVÉS pour le retour de ces produits :
      `images/posters/Visseuseachocflex.webp` + `-hero.webp` et
      `models/products/Visseuseachocflex.glb` (visseuse Flex ID 1/4").
      (3 autres fiches fantômes déjà supprimées le 18/07 : Stanley FMC645D2,
      FMC688L2, Facom CL2.C18S.)
- [x] **3 Festool au SKU inventé — SUPPRIMÉS le 26/07/2026.** `TI-18` (TID 18),
      `TPC-18` (TPC 18/4) et `TSC55` (TSC 55 KEB Set) avaient un SKU qui ne
      correspond à rien chez cotébrico (tous les autres Festool utilisent le
      VRAI code article numérique — 577985, 578011… — et sont bien traqués).
      Vérification user sur cotébrico : **une seule des trois existe**, et
      encore, dans une AUTRE configuration (TSC 55 KEB-Basic 100Y **Limited
      Edition solo**, réf 578223, 533,61 € — pas le Set 2×5,2Ah + rail de la
      fiche). Décision user : supprimer les trois — une édition limitée est une
      référence temporaire, le produit redeviendrait introuvable au traqueur.
      ⚠️ ASSETS CONSERVÉS pour un éventuel retour : `images/posters/tsc55.webp`
      + `-hero.webp` et `models/products/tsc55.glb` (⚠️ le poster montre le SET
      avec ses 2 batteries → à refaire si on repart sur une version « machine
      seule », règle posters).

## ⚠️ CHECKLIST PRÉ-LANCEMENT — à dérouler quand l'user demande « est-ce qu'on est prêt à lancer »
Le site N'EST PAS lancé (décidé le 15/07/2026). Ne rien ouvrir au public tant que ces points bloquants ne sont pas faits. Quand l'user pose la question, PARCOURIR cette liste et donner l'état point par point.

### 🔴 BLOQUANT (légal — sinon illégal de vendre en B2C)
- [ ] Remplir les champs `[À COMPLÉTER]` des 3 pages : mentions légales, confidentialité, CGV (identité entreprise : raison sociale, statut, SIRET, RCS, adresse, TVA, capital, directeur publication, email pro).
- [ ] Adhérer à un **médiateur de la consommation** agréé (CM2C, Medicys… ~50-100€/an) et mettre ses coordonnées dans mentions + CGV. OBLIGATOIRE pour vendre aux particuliers.
- [ ] Faire relire les 3 documents légaux par un juriste (recommandé fort).
- [x] **INFRA EMAIL COMPLÈTE ✅ (25/07/2026 soir, guidée pas à pas, testée de bout
      en bout)** — état GRAVÉ :
      • Vercel `OWNER_EMAIL` = contact.piratestools@gmail.com (reçoit tout :
        contact, candidatures artisans, alertes, rapport mensuel).
      • Resend : compte contact.piratestools + `RESEND_API_KEY` posée sur Vercel ;
        test admin « ✅ Resend fonctionne » REÇU.
      • Domaine pirates-tools.com VÉRIFIÉ chez Resend (région eu-west-1, DNS
        posés AUTO via Cloudflare — le DNS du domaine est chez CLOUDFLARE,
        compte ki.legrix). `RESEND_FROM` = `Pirates Tools <contact@pirates-tools.com>`
        → tous les emails du site partent sous le domaine (testé reçu).
      • Cloudflare Email Routing ENABLED : contact@pirates-tools.com →
        contact.piratestools@gmail.com (destination Verified ; test iCloud reçu
        dans Gmail 23h37). ⚠️ piège : domaine AVEC tiret (pirates-tools.com),
        gmail SANS tiret — 1er test avait rebondi sur piratestools.com inexistant.
      • Le site peut donc ENVOYER (Resend, domaine signé) et le domaine peut
        RECEVOIR (Cloudflare). Prérequis « emails clients » de la Phase 3b : OK.
      • Manquent encore sur Vercel (notés, non urgents) : CRON_SECRET (rapport
        mensuel), STRIPE_WEBHOOK_SECRET (au lancement Stripe) ; badge « Needs
        Attention » sur STRIPE_…_KEY à examiner au dégel de Stripe.
- [x] Email AFFICHÉE sur le site ✅ (MISE À JOUR 25/07 tard, décision user après
      activation de l'Email Routing) : **contact@pirates-tools.com** (l'adresse
      pro du domaine, qui REÇOIT désormais via Cloudflare → transfert vers la
      boîte réelle contact.piratestools@gmail.com). RÈGLE À JOUR : adresse
      affichée partout sur le site = contact@pirates-tools.com ; boîte de
      réception réelle + comptes de service (Resend, OWNER_EMAIL) =
      contact.piratestools@gmail.com. Le gmail perso ki.legrix ne s'affiche
      JAMAIS. Reste : reporter contact@pirates-tools.com dans les champs
      [À COMPLÉTER] des mentions/CGV.

### 🔴 BLOQUANT (paiement carte)
- [ ] Activer le compte Stripe (infos entreprise + RIB) pour encaisser en LIVE.
- [ ] Créer le webhook Stripe → URL `https://pirates-tools.com/api/webhook`, copier le `whsec_...` dans Vercel comme `STRIPE_WEBHOOK_SECRET`.
- [ ] Vérifier toutes les env vars Vercel : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, FIREBASE_SERVICE_ACCOUNT, RESEND_API_KEY, RESEND_FROM, OWNER_EMAIL, ADMIN_SECRET, META_APP_ID/SECRET/ACCESS_TOKEN. (ALLOWED_ORIGINS optionnel.)

### 🟠 AVANT D'OUVRIR LE CRYPTO (si tu actives ce canal)
- [ ] Scanner le QR crypto local avec un VRAI wallet (Metamask…) et confirmer qu'il affiche la bonne adresse. Preuve finale avant tout paiement crypto réel.

### 🟢 MISE EN PROD
- [ ] Merger `claude/pirates-tools-rebuild-zWc1b` → `master` (Vercel auto-déploie).
- [ ] Vérifier `pirates-tools.com/api/health?test` renvoie du JSON (API branchée).

### ✅ DÉJÀ FAIT
- Firebase Authorized domains (pirates-tools.com + www) ✅. Domaine sur Vercel ✅. Plan remédiation 10/10 + QR local ✅.

### ⚪ NON BLOQUANT (dette technique reportée, cosmétique)
- Refactors CSS risqués (étape 9 : fork inline, !important, z-index). Split fonctions XXL (10d). Peuvent attendre après le lancement.

## Plan de remédiation en cours
Document maître : `pirates-tools/docs/PLAN-REMEDIATION.md` (10 étapes, versionné).
Ordre non négociable : argent → sécurité → fonctionnel → structure → polish.
Règle : **1 étape = 1 problème = 1 commit = 1 vérification verte**. Jamais d'étape à moitié faite.

### Suivi des étapes
- [x] 1. Routeur : ajouter /admin /merci /contact /favoris à ROUTES (app.js:2753) ✅ commit, SW v290
       Note : cancel_url '#/checkout' (app.js:3876) pointe vers une route fantôme → à traiter étape 2 (le repointer vers #/devis).
- [x] 2. Intégrité des prix ✅ commit, SW v291
       Serveur autoritaire : api/_lib/pricing.js (port exact de calcPrice) + api/_lib/catalog.js.
       create-payment-intent.js & checkout.js recalculent depuis le catalogue par `key`, ignorent le prix client.
       Client envoie {key,qty}, affiche le TTC territorial (payUnitCents, arrondi identique serveur).
       Parité garantie par scripts/check-pricing.js (dans ci.js). parseHash tolère ?query. cancel_url #/checkout→#/devis.
       NOTE : remise fidélité volontairement PAS répercutée sur le montant débité (éviterait un nouveau trou de confiance client) — à décider avec l'utilisateur si on veut l'appliquer (nécessiterait vérif serveur).
- [x] 3. Verrouiller API ✅ commit (server-only, pas de bump SW)
       api/_lib/auth.js (requireAdmin + timingSafeEqualStr via crypto.timingSafeEqual).
       api/_lib/http.js (applyCors : refus par défaut, allowlist via env ALLOWED_ORIGINS).
       orders.js verrouillé admin-only (le client ne l'utilise PAS — il passe par le SDK Firebase sous règles Firestore).
       admin.js / instagram.js / test-email.js : auth timing-safe partagée + applyCors.
       vercel.json : suppression du CORS wildcard /api + ajout X-Content-Type-Options nosniff.
       health.js expose allowedOrigins. Pour activer un cross-origin : définir ALLOWED_ORIGINS sur Vercel.
- [x] 4. Failles XSS ✅ commit, SW v292
       escapeHTML réécrit (pur, échappe & < > " ' — les 5 caractères OWASP) → ferme l'injection d'attribut systémique.
       Vérifié : escapeHTML jamais utilisé avec textContent/.value (donc &quot; jamais affiché). Descriptions produit rendues via textContent (immunisées).
       openPayModal it.title déjà échappé (étape 2). Templates plans/abonnements : toutes interpolations innerHTML échappées (défense en profondeur). href via encodeURIComponent.
- [x] 5. Cohérence déploiement ✅ commit, SW v293
       Prod unique = Vercel (ish-ebon.vercel.app). canonical/og/twitter/robots/sitemap repointés vers Vercel.
       sitemap réduit à l'URL racine indexable (SPA hash → fragments ignorés des crawlers) + og:site_name/og:locale ajoutés.
       Auto-déploiement GitHub Pages DÉSACTIVÉ (deploy-pirates-tools.yml → workflow_dispatch only, non supprimé).
       Workflows morts supprimés (pirates-tools/.github/workflows/*). Nouvelle CI racine .github/workflows/pirates-tools-ci.yml exécute scripts/ci.js sur push/PR.
       Domaine perso = pirates-tools.com (repointé partout : canonical/og/twitter/robots/sitemap/README/firebase-init/sw). SW v294.
       ACTION USER REQUISE : Firebase Console → Auth → Authorized domains → ajouter pirates-tools.com (sinon login échoue).
- [x] 6. Webhook Stripe ✅ commit (server-only, pas de bump SW)
       Corps brut : bodyParser désactivé (module.exports.config) + readRawBody (stream→Buffer) → constructEvent sur les octets exacts signés.
       Idempotence : api/_lib/firebase.js (getFirebase partagé) + claim atomique event.id dans Firestore `stripe_events` (create() échoue si doublon → 200 skip, pas de 2e email).
       Réponses uniformisées {ok:true,received:true}. Order update via db partagé.
       NOTE : dedup gated sur Firebase (nécessaire pour store persistant serverless).
- [x] 7. Bugs Service Worker ✅ commit, SW v295
       7a empoisonnement : handleNavigate guard isShell (seul / ou /index.html rafraîchit la clé ./index.html).
       7b fallback image mort : await chaque fromCache (Promise toujours truthy → respondWith(null)).
       7c navigationPreload déplacé install→activate. 7d CLEAR_OLD_CACHES dans e.waitUntil.
       7e APP_SHELL nettoyé (pt.js inexistant retiré, clé shell unique ./index.html, fin du triple stockage + staleness clé versionnée).
       7f handleProducts : réponse non-ok → fallback cache. 7g branches opaque mortes supprimées.
       favicon/manifest/apple-touch-icon versionnés dans index.html (90-92) pour matcher le précache.
- [x] 8. Bugs runtime app.js ✅ commit, SW v296
       8a starBtns → reset via starsSelect.querySelectorAll (fin du ReferenceError à l'envoi d'avis).
       8b saveCart + saveHomeReview : try/catch sur setItem (Safari privé/quota).
       8c confirmPayment : .catch (bouton réactivé si réseau coupe, plus de rejection non gérée).
       8d NOWPayments : suppression du chemin client x-api-key (fuite clé de compte) ; config cardCheckout réduite à {url:''}. co.url (lien pré-généré) reste. Dynamique → futur endpoint serverless.
       8f fuites listeners : setupModelViewerScrollPassthrough retire mouseleave/touchstart ; pdpWa → onclick (plus d'empilement).
       8g garde auth : redirection /compte↔/auth seulement si _authReady (fin double-flicker au reload).
       8e QR crypto tiers : ✅ RÉSOLU (SW v299). qrserver retiré → génération 100 % locale via qrcode.js vendu (qrcode-generator v2.0.4, MIT, lisible). Lazy-load (ensureQRLib, mirror ensureThree) + cryptoLocalQR (createDataURL). Vérifié par aller-retour encode→décodage jsqr indépendant→adresse identique (6 cas réels). Repli sûr : jamais de tiers, l'adresse texte fait foi. Reste : scan par l'user avec vrai wallet avant ouverture crypto.
- [~] 9. Assainir CSS/HTML — SOUS-ENSEMBLE SÛR FAIT ✅ commit, SW v297 ; refactors risqués REPORTÉS.
       FAIT : (1) lumière dorée restaurée (#hero::before halo radial or, styles.css:444) ; (2) console debug retirée de la prod (~82 l., index.html) ; (3) <h1> sr-only sur l'accueil (SEO/a11y) ; (4) CSS mort retiré (315 l. : section 12 modal 3D + sections 21-22 site-links/footer mort — TOUS sélecteurs vérifiés 0-réf ; vrai footer .footer-social/.site-footer intact).
       REPORTÉ (nécessite vérif visuelle par-règle, refusé de sweeper à l'aveugle = « aucun hasard ») :
        - fork inline styles.css vs index.html (.drawer/#toasts/.toast/#dock) : déplacer verbatim en fin de styles.css (ordre cascade préservé) — à faire prudemment.
        - purge !important (71→moins) : chaque retrait change la cascade → test visuel requis.
        - échelle z-index documentée : réordonner l'empilement → test visuel requis.
        - #a2hsTip mort mais éparpillé (styles.css 4367+, 4888) → suppression ciblée.
        - renumérotation sections CSS (doublon 10b, sections 32+ non numérotées).
- [x] 10. Qualité structurelle & CI ✅ commit, SW v298
       10a helper apiBaseUrl() → factorise les 11 résolutions PT_API_BASE dupliquées.
       10b dérive de prix corrigée : favoris/récents affichaient formatPrice(p.price) métropole → calcPrice().ttc territorial (comme partout).
       10c init Firebase UNIQUE : _lib/firebase.js seul require('firebase-admin') ; admin.js/orders.js/catalog.js migrés vers getFirebase.
       10e rate limiting Firestore (_lib/ratelimit.js, fenêtre fixe, fail-open) : contact 5/h/IP, newsletter 5/h/IP.
       10f test-email.js : plus d'écho de la réponse brute Resend (loggé serveur). instagram.js gardé (admin-only, utile au diagnostic — décision documentée).
       10g CI déjà branchée (étape 5). 10h docs : CHANGELOG v2.1.0 + README (version, tailles, NOWPayments).
       REPORTÉ 10d : découpe des fonctions XXL (renderAdmin/initPdpScrollAnimations/renderPDP) — refactor cosmétique risqué, pas de valeur fonctionnelle, à faire avec tests.

═══ PLAN DE REMÉDIATION TERMINÉ (10/10 étapes) + QR crypto local (8e) fait. ═══

## Session dette technique post-remédiation (15/07/2026, SW v308, mergé master)
Méthode : vérif visuelle RÉELLE via harness Playwright (serveur statique local +
captures avant/après + assertions DOM), pas de sweep à l'aveugle.
- ✅ Halo doré RÉ-ANCRÉ : #hero::before (position:fixed, bavait sur le fond) →
  .hero-logo-container::before (cercle or localisé, centré sur le logo, corrigé
  du padding-top/2 ; z-index 0 < logo 11). Disparaît avec le hero. Vérifié :
  présent accueil, ABSENT catalogue.
- ✅ 3D À LA DEMANDE (perf) : model-viewer retiré du <head> → ensureModelViewer()
  (miroir ensureThree), déclenché PDP à l'ouverture + carrousel/cartes via l'IO
  ~700px. .catch sur chaque appel (échec CDN → poster, pas de rejet nu). wa.me
  preconnect retiré. Vérifié : page sans 3D = 0 injection.
- ✅ IMAGES : facom.png 383 Ko (logo sur fond métal PHOTO, PNG inadapté) →
  facom.webp 62 Ko (-84 %, q88, visuellement identique, réf app.js:940). Logo
  mort 1,35 Mo (0-réf) → images/_originals/ + .vercelignore (exclut les HD du
  déploiement). images/ servi 3,0→1,3 Mo. Posters produits laissés JPEG (~30 Ko,
  lazy, gain marginal + poster model-viewer ne gère pas <picture>).
- ✅ CSS mort purgé : #a2hsTip/#a2hsTriangle/.a2hs-tip__*/@keyframes a2hs-in +
  #netBanner (tous 0-réf vérifiés). Échelle z-index documentée en tête de
  styles.css (couches -1→10000).
REPORTÉ (inchangé, risque cascade réel / valeur nulle, à faire AVEC tests) :
- fork inline index.html/styles.css (.drawer/#dock/#toasts/.toast/.backdrop…
  dupliqués, l'inline gagne) : fusion touche tous les états interactifs, 0 gain.
- purge !important (échelle z-index désormais documentée pour aider).
- 10d découpe XXL : initPdpScrollAnimations (397 l., moteur rAF à état partagé —
  split = risque timing non vérifiable en statique), renderAdmin (251 l., CRUD
  admin non exerçable ici), renderPDP (225 l.). Décision étayée : pas de gain
  utilisateur, refactor pré-lancement écarté.

## Session « argent & confiance » A1-A5 (15/07/2026, SW v310, mergé master)
Suite à l'audit complet 4 axes (rapports : API/sécu, CSS/HTML, app.js, PWA/SEO/a11y).
Correctifs paiement, 1 commit chacun, tests unitaires + Playwright :
- ✅ A1 territoire fiscal : validation stricte (400 si code inconnu) sur les 2
  endpoints ; Checkout collecte l'adresse de livraison (GP/MQ/GF/RE/YT/FR) ;
  _lib/postal.js (CP → territoire, 22 tests). Contrôle DÉTECTIF branché au
  webhook : divergence territoire déclaré ↔ CP réel = ⚠ email owner + journal.
  Limite documentée : flux Elements sans adresse pré-paiement (préventif
  intégral = Address Element, décision produit).
- ✅ A2 webhook : payment_intent.succeeded/failed traités (filtre
  metadata.source='pirates-tools' → pas de double email avec les sessions) ;
  lignes {key,qty} chunkées dans la metadata PI (_lib/stripe-meta.js, limites
  Stripe testées 50 lignes) ; reconstruction serveur du détail avec contrôle
  d'intégrité au centime (dérive → repli ligne unique) ; journal Firestore
  payments/{stripeId} = trace serveur systématique ; matching commande par
  stripeSessionId ET paymentIntentId ; 17 assertions unitaires (_internals).
- ✅ A3 : total panier affiché = montant réellement débité (plein tarif). La
  remise fidélité N'EST PAS débitable (état localStorage falsifiable) → bloc
  « Avantage −X % — non déduit ici, à faire valoir sur devis WhatsApp ».
  Remise réelle = fidélité serveur par uid (décision produit, non fait).
- ✅ A4 : rate limit seau PARTAGÉ 'payment' 20/h/IP sur create-payment-intent
  + checkout (429), après les gardes method/config, fail-open documenté.
- ✅ A5 : /merci exige une PREUVE (paymentIntentId inline / redirect_status=
  succeeded / session_id correspondant) sinon rien n'est écrit ; crypto →
  statut 'declared', 0 point ; pending consommé AVANT effets (anti-double au
  refresh) ; périmé >2h purgé ; items=nombre + lines[] (fix affichage compte) ;
  stripeSessionId écrit (webhook peut confirmer) ; URL Stripe nettoyée
  (replaceState). 9 scénarios Playwright verts.
Restent de l'audit (hors argent) : C1 .btn--primary jamais définie, C2 accents
manquants, C3 preload 3D no-op catalogue, C5 updateEmail ordre, C6 a11y modales
/focus/skip-link, C7 tokens couleur, C8 double fidélité (atténué : le local est
désormais un cache synchronisé sur le serveur à chaque devis de paiement).

## Session pré-C (15/07/2026, SW v311, mergé master) — suites A1-A5
- ✅ Index Firestore RÉSOLU À LA RACINE : uid client → metadata Stripe (sanitisé
  [A-Za-z0-9_-]{1,128}, jamais un droit) → webhook matche users/{uid}/orders en
  CHEMIN DIRECT (index automatiques, rien à créer). collectionGroup = repli
  (anciens paiements) couvert par firestore.indexes.json versionné
  (`firebase deploy --only firestore:indexes` ou URL 1-clic loguée).
  payments/ journalise l'uid (succeeded + failed).
- ✅ REMISE FIDÉLITÉ RÉELLE (décision produit tranchée : oui) : _lib/loyalty.js,
  dépense vérifiée = somme des payments 'succeeded' de l'uid (webhook-only →
  infalsifiable). create-payment-intent débite brut−remise (metadata gross/pct/
  discount, tronquée si <50c) ; checkout via coupon Stripe once ; webhook ajoute
  la ligne négative « Remise fidélité −X % » (intégrité au centime conservée,
  metadata mensongère→fallback) ; la modale se réaligne sur la réponse serveur
  (total + ligne remise) et synchronise le cache local pt:loyalty ;
  scripts/check-loyalty.js en CI (parité paliers app.js ↔ serveur).
- ✅ ADRESSE AVANT PAIEMENT (décision produit tranchée : oui) : formulaire
  adresse NATIF dans la modale carte (choix délibéré vs Address Element :
  pas de refonte du flux confirm, pas de perte de saisie, testable). Le
  formulaire carte n'apparaît qu'à adresse valide ; le CP fixe le territoire
  (serveur re-dérive via _lib/postal.js = AUTORITAIRE ; hors DOM → 400) ;
  changement de CP → PI re-créé au bon taux ; adresse attachée au PI ;
  webhook détectif sur pi.shipping en priorité. 6 scénarios Playwright verts
  + tests serveur (75001 refusé, 97110 prime, rétrocompat sans CP).
NOTE : le flux checkout (repli sans Stripe.js) collecte l'adresse via Stripe
(shipping_address_collection) — la remise y passe par coupon, le territoire y
reste déclaré+détectif (pas de CP pré-session ; acceptable, flux secondaire).

## Session tableau C — C1 à C8 (15/07/2026, SW v312, mergé master)
Audit résiduel soldé, 8/8, 1 commit chacun, régression complète rejouée en fin
de batch (2 tests périmés réalignés, zéro régression produit) :
- ✅ C1 .btn--primary (jamais définie, 8 réfs) → unifiée sur .btn.primary.
- ✅ C2 accents : 94+8+35 remplacements en 3 passes CONTEXTUELLES (succes=type
  toast, detail=<details> → jamais de sed aveugle) ; plans/abonnements inclus ;
  products.json exclu (données). Corollaire : skip-link top -42→-80px (liseré
  blanc détecté par analyse de pixels du coin haut-gauche).
- ✅ C3 preload 3D : cartes loading="lazy" (l'IO ~700px upgrade + charge le
  script) — accès direct #/catalogue fonctionnel (15 cartes, 8 upgradées,
  1 injection) + bonus perf (GLB sous le fold non chargés).
- ✅ C4 fork inline FUSIONNÉ : 3 blocs <style> déplacés VERBATIM en fin de
  styles.css (§45) — cascade équivalente par construction ; 0 <style> dans le
  HTML ; échelle z-index corrigée aux valeurs EFFECTIVES (backdrop 1000,
  drawer 1001, toasts 10000). Vérifié : styles calculés identiques + diff
  pixels 0,000 % + drawer/toast/dock réels. Dédoublonnage NON fait (étape
  suivante possible, sans urgence).
- ✅ C5 updateEmail : Auth D'ABORD → Firestore ENSUITE ; échec Auth = zéro
  divergence (doc intact, champ restauré, message précis) ; profil enregistré
  indépendamment. Prouvé par stub PT_FIREBASE journalisant l'ordre des appels.
- ✅ C6 a11y : trapFocus réel (Tab/Shift+Tab confinés, restauration au
  déclencheur — getClientRects car offsetParent null sous fixed) sur payModal
  + drawer ; focus du h1 de vue à chaque VRAI changement de route (clé
  route|slug — onRouteChange re-tire sur la même route au boot, piège détecté
  par harnais) ; skip-link réel (activation JS, pas de hash routeur).
  9/9 assertions clavier.
- ✅ C7 tokens : --accent/--accent-rgb/-deep/-dark/-soft ; 313 littéraux violets
  → 0 dans styles.css ; canvas + emails serveur exclus (documenté) ; diff
  pixels avant/après = 0,000 %.
- ✅ C8 fidélité : plus AUCUN point sur envoi de devis (doc tracé status:
  'quote') ; compte affiché depuis la dépense vérifiée (cache pt:loyalty
  synchronisé serveur) ; champ profil `loyalty` legacy (ni incrémenté ni
  affiché) ; barre = progression réelle vers le palier suivant.

## Session audit boutons (15/07/2026, SW v313, mergé master)
Bug signalé (« les chips catégories ne marchent pas ») → cause prouvée par
hit-test : le BANDEAU COOKIES mobile (fixed z9700, +96px au-dessus du dock,
texte ~8 lignes = pavé ~350px) recouvrait les chips et avalait les taps à
chaque session en navigation privée. Correctifs : bandeau au vrai bas (peut
couvrir le dock temporairement) + texte court avec lien politique + pile
verticale mobile + max-height 30vh ; chips catalogue = rangée unique
défilante sur mobile ; devis +/− recouverts par le sous-total → flex-wrap.
OUTIL AJOUTÉ : scratchpad audit-buttons.js — volet A hit-test de tous les
boutons/liens visibles (11 routes × desktop/iPhone × bandeau affiché ; barres
de nav fixes = non-défaut ; pointer-events:none exclus ; retry scrollIntoView
behavior:'instant' — OBLIGATOIRE, le smooth global fausse les lectures) +
volet B fonctionnel (chips, recherche, select, PDP, panier, modale, menu,
territoire, carrousel, auth, contact, footer, dock). Résultat final : 0 défaut.

## Session résilience écran noir (15/07/2026, SW v314, mergé master)
Bug iPad intermittent : page noire (vues .hidden), seuls topbar/dock/WhatsApp
statiques affichés. Cause : après un déploiement (8 bumps ce jour-là), app.js
?v=NOUVEAU absent du cache SW + hoquet réseau → handleStatic rendait 504 VIDE
→ app jamais exécutée, aucune relance. Introuvable en harnais SANS SW —
reproduit avec page contrôlée par SW + serveur coupé. Défense en 2 étages :
- sw.js fromCacheAnyVersion : dernier recours = même chemin en cache,
  ignoreSearch (app périmée fonctionnelle > page morte ; SWR rafraîchit après).
- index.html watchdog inline #ptBootWatchdog : PT_BOOTED (fin d'init app.js)
  absent après 7 s → message + bouton Recharger. Plus JAMAIS d'écran noir muet.
Vérifié 5/5 : app.js coupé→watchdog ; boot normal→pas de watchdog ; SW
contrôle ; serveur coupé + ?v=inconnu → 200 depuis le cache (273 Ko).
PIÈGE TEST : querySelector('div[role=alert]') matche #stripeCardError en
premier — cibler #ptBootWatchdog.

## Session cybersécurité S1-S3 (15/07/2026, SW v315, mergé master)
Suite à un audit sécurité complet 4 axes (API, Firebase, client/XSS, RGPD).
Verdict : socle solide (0 XSS exploitable, prix/fidélité serveur, QR local, SW
sain, pas de carte touchée). 3 failles critiques traitées :
- ✅ S1 RÈGLES FIRESTORE (le trou racine) : AUCUN firestore.rules n'était
  versionné → la seule barrière protégeant les données clients était inconnue.
  Créé firestore.rules (DEFAULT-DENY) + firebase.json : users/{uid} self-only +
  allowlist de champs ; orders création client 'quote'/'pending'/'declared'
  seulement (jamais 'paid') ; payments/stripe_events/rate_limits/
  product_overrides fermées au client ; catch-all final if false. PROUVÉ par
  scripts/test-rules.js (27 assertions) contre l'ÉMULATEUR Firestore réel
  (firebase-tools installé en dev). NON branché à la CI (émulateur requis).
- ✅ S3 (fermé par S1) : le client ne peut plus forger status:'paid' (règle) ;
  /merci écrit 'pending', le webhook Admin SDK confirme en 'paid'.
- ✅ S2 IDOR uid : create-payment-intent/checkout faisaient confiance à
  body.uid → un attaquant lisait la dépense/fidélité d'autrui + volait sa
  remise. Corrigé : _lib/firebase.verifyUid(req) vérifie l'ID token Firebase
  (Authorization Bearer) ; uid dérivé UNIQUEMENT du token vérifié, body.uid
  ignoré. Client : jsonAuthHeaders() joint getIdToken aux 2 POST.
⚠️ ACTIONS USER AVANT LANCEMENT :
  1. DÉPLOYER LES RÈGLES : `cd pirates-tools && npx firebase deploy --only
     firestore:rules` — TANT QUE CE N'EST PAS FAIT, la protection des données
     clients reste théorique (règles réelles sur le projet = inconnues).
  2. Vérifier FIREBASE_SERVICE_ACCOUNT sur Vercel (verifyIdToken en dépend ;
     sans lui, uid=null → aucune remise mais paiement OK).
Restent de l'audit sécu (🟠, non bloquants, à faire) : en-têtes CSP+HSTS+
Permissions-Policy (vercel.json) ; rate-limit x-real-ip au lieu de xff ;
territoire fiscal CP obligatoire côté API ; énumération de comptes ;
verifyBeforeUpdateEmail ; GA4/Meta Pixel sur-déclarés dans les textes.

## Session renforcements sécu H1-H6 (15/07/2026, SW v316, mergé master)
Suite aux 🟠 de l'audit cybersécurité. 1 commit chacun, tests unitaires +
Playwright + émulateur.
- ✅ H1 CSP + HSTS + Permissions-Policy (vercel.json) : CSP STRICTE sans
  'unsafe-inline' pour scripts → 3 scripts inline autorisés par EMPREINTE
  sha256 (restent frais avec le HTML). Whitelist Stripe/Firebase/CDN 3D/
  CoinGecko. HSTS 2 ans preload. Permissions-Policy (geoloc/cam/micro coupés,
  payment=self+stripe). COOP same-origin-allow-popups. GARDE-FOU CI :
  scripts/check-csp.js recalcule les hashes depuis index.html (dérive = CI
  rouge). Vérifié Chromium : 0 violation sur le code propre. NOTE : le ?v=
  bump ne change PAS les scripts inline → hashes stables.
- ✅ H2 rate-limit x-real-ip (Vercel, non spoofable) au lieu du 1er
  x-forwarded-for (falsifiable). Repli = DERNIER token XFF.
- ✅ H3 code postal OBLIGATOIRE sur create-payment-intent → territoire dérivé
  du CP seul (fin du taux Mayotte forçable par appel API direct). checkout
  (repli) reste déclaré+détectif.
- ✅ H4 anti-énumération : login → message générique unique ; reset password →
  message neutre même si compte inexistant. + activer Email Enumeration
  Protection console.
- ✅ H5 verifyBeforeUpdateEmail (au lieu d'updateEmail) : le nouvel email doit
  être vérifié ; email non écrit en Firestore avant confirmation ; s'appuie sur
  requires-recent-login (réauth de fait).
- ✅ H6 auth admin par CLAIM Firebase (rétrocompat secret) : verifyAdmin
  (claim admin===true) ; requireAdmin async accepte claim OU secret (aucun
  faux positif, échec fermé) ; client envoie X-Admin-Secret + Bearer si
  connecté ; scripts/set-admin-claim.js.
⚠️ ACTIONS USER (notées) :
  - H6 : `node scripts/set-admin-claim.js <email>` → reconnexion → vérifier
    /admin connecté sans secret → SUPPRIMER ADMIN_SECRET sur Vercel.
  - H4 : ✅ FAIT — « Protection contre l'énumération d'adresses e-mail »
    déjà ACTIVÉE (vérifié sur capture 25/07 : Auth → Paramètres → Actions des
    utilisateurs, case cochée par défaut). + création & suppression activées.
firebase-tools + émulateur Firestore installés en dev (non committés) pour
tester règles (S1) — restent dispo pour re-tester.

## Session RGPD/mineurs M1-M5 (15/07/2026, SW v317, mergé master)
Derniers 🟢 de l'audit sécurité soldés :
- ✅ M1 fin sur-déclaration GA4/Meta Pixel : bandeau consentement affiché
  UNIQUEMENT si un traceur est configuré (IDs vides → pas de bandeau, conforme
  ePrivacy) ; politique reformulée (aucun traceur actif à ce jour). Mécanisme
  prêt : dès qu'un ID est renseigné, bandeau + consentement réapparaissent.
- ✅ M2 IP hachée (sha256 tronqué) dans rate_limits/ au lieu d'en clair.
  Rappel owner : activer policy TTL Firestore sur rate_limits.expiresAt.
- ✅ M3 pas de PII dans les logs : webhook logue orderRef, plus l'email ;
  contact/newsletter loguent status+message d'erreur, plus l'objet complet.
- ✅ M4 droit à l'oubli : rules owner-delete (users/{uid} + orders ; payments/
  conservé comptable) ; UI Paramètres « Supprimer mon compte » ; flux réauth
  mot de passe → purge orders+profil → deleteUser → nettoyage. test-rules.js
  29/29 (owner supprime SES données, pas celles d'autrui). Playwright OK.
- ✅ M5a noopener sur window.open WhatsApp (app.js). M5b SRI sha384 sur
  model-viewer 3.5.0 (hash calculé sur le fichier réel ajax.googleapis).
  three.js : SRI reporté (fichier jsdelivr injoignable via proxy pour hasher ;
  protégé par restriction d'origine CSP).
firestore.rules : delete désormais autorisé au titulaire (M4) — test-rules.js
à jour (29 assertions).

## Régression 3D post-sécurité (16/07/2026, SW v318, mergé master)
Bug : outils 3D ne s'affichent plus (après H1/M5b). Cause PROUVÉE : tous les
.glb produits sont KHR_draco_mesh_compression → model-viewer décode via un Web
Worker créé depuis un blob: + WASM (draco/basis depuis gstatic). La CSP H1
avait worker-src 'self' (bloque blob:) et pas de 'wasm-unsafe-eval' (bloque
WASM) → décodage impossible → 0 modèle rendu. Correctifs vercel.json :
worker-src 'self' blob: + child-src 'self' blob: + script-src 'wasm-unsafe-eval'
('wasm-unsafe-eval' ≠ 'unsafe-eval' → check-csp reste vert). SRI model-viewer
(M5b) RETIRÉ : crossOrigin+integrity exigeaient CORS + octets identiques au bit,
invérifiable en sandbox et 2e facteur de blocage ; protection = restriction
d'origine CSP. LEÇON : toute CSP sur un site 3D DOIT autoriser worker-src blob:
+ wasm-unsafe-eval. Rendu 3D réel non testable en sandbox (pas de réseau CDN) →
confirmation user sur le live.
NOTE : bandeau cookies masqué au démarrage = VOULU (M1, aucun traceur configuré)
— pas un bug ; peut être ré-affiché si un jour un ID GA4/Meta est renseigné.

## Session 3 bugs post-sécurité (16/07/2026, SW v320, mergé master)
LEÇON PROTOCOLE : les correctifs v319/v320 étaient restés sur la branche SANS
merge master pendant que l'user testait le live (= v318 encore cassée) → il a
constaté « rien ne marche ». TOUJOURS merger master après vérification (Vercel
ne déploie QUE master), c'est le protocole convenu (« tu peux merge et je te
fais un retour »).
Retours user (captures iPad, navigation privée) : (a) textures 3D blanches,
(b) page vide intermittente au clic catégorie, (c) bandeau cookies absent.
Méthode : reproduction Playwright sous la CSP RÉELLE + model-viewer vendu en
local (mv.js téléchargé), + capture analysée finement (la 5e capture a corrigé
mon diagnostic initial).
- ✅ TEXTURES BLANCHES (v319) : les GLB embarquent leurs textures en
  EXT_texture_webp (image/webp). three.js les décode en créant un blob: URL
  chargé via fetch() → gouverné par connect-src. La CSP (H1) n'autorisait blob:
  ni dans img-src ni dans connect-src → « Refused to connect blob: — connect-src »
  → « THREE.GLTFLoader: Couldn't load texture » → surface blanche (géométrie
  DRACO OK depuis v318). Correctif : blob: ajouté à img-src ET connect-src
  (blob = same-origin URL.createObjectURL, sûr). Reproduit + 0 violation après
  fix. LEÇON : site 3D avec textures embarquées webp/png → la CSP DOIT autoriser
  blob: dans connect-src (fetch du blob) ET img-src (voie Image/TextureLoader).
- ✅ PAGE VIDE (v320) : la capture montrait topbar+dock fixes MAIS ni barre de
  recherche ni chips ni liste = VUE entière non peinte (pas « #list vidé »).
  Cause : `.view { content-visibility:auto; contain-intrinsic-size:800px 600px }`.
  Sur iOS Safari, une vue dont le sous-arbre est remplacé (re-render #list au
  clic catégorie) ou révélée via bascule display reste « skipped » → seul le
  placeholder ~800×600 est peint = rectangle noir. Présent AVANT v314 → explique
  que la résilience SW n'ait rien changé (mauvaise cause à l'époque). Indice :
  l'auteur avait déjà neutralisé content-visibility sur #view-produit (« casse
  sticky »). Correctif : retiré de .view/.card/.cat-card (gain perf nul : SPA =
  1 vue affichée, listes 26 items). #view-produit reste content-visibility:
  visible. Écarté par test : PAS l'épuisement WebGL (model-viewer 3.x =
  renderer partagé unique, testé 26→2 ×8 = 0 fuite) ni la mémoire (aurait blanchi
  les modèles, pas la barre de recherche). Confirmation non-blank iPad = user.
- ✅ BANDEAU COOKIES (v320, REMPLACÉ en v321) : M1 le masquait (aucun traceur =
  pas de consentement requis). User le veut visible sans mentir. v320 = info +
  « J'ai compris » (bouton unique). RETOUR USER : pas de choix = « pas
  respectable » → v321 = schéma standard : cookies techniques TOUJOURS actifs
  (annoncés dans le texte, pas de case) + choix RÉEL Accepter/Refuser pour la
  mesure d'audience. Honnêteté : « pourra être activée » (aucun traceur branché) ;
  le choix est enregistré dans pt:analytics-consent = LA clé qui gouvernera
  GA4/Meta le jour d'un ID renseigné (Refuser = jamais de traçage, même après
  activation). CNIL : Refuser aussi accessible qu'Accepter. pt:cookie-notice
  supprimée. 10/10 assertions Playwright (refus/accept/persistance/reload/
  session privée/lien politique).
REVERSAL DOC : la NOTE M1 ci-dessus (« bandeau masqué = voulu ») est désormais
caduque — remplacée par le bandeau info honnête.

## Canal crypto DÉSACTIVÉ (17/07/2026, SW v322, mergé master)
Décision produit : le paiement crypto (flux déclaratif non vérifié serveur =
risque fraude) est masqué au lancement, SANS effacer le code. Interrupteur
`PT_CRYPTO_ENABLED=false` (app.js) + 3 couches : UI (onglet + barre d'onglets
masqués via applyCryptoVisibility), logique (cryptoSwitchTab force 'card',
init crypto off), et firestore.rules ('declared' retiré de la liste blanche
create = vrai verrou anti-fraude). Réactiver = flag true + 'declared' remis
dans les règles (commentaires croisés). Vérifié : Playwright 7/7 + émulateur
29/29 (« Alice NE peut PAS créer declared »). ⚠️ le verrou serveur suppose les
règles DÉPLOYÉES (`firebase deploy --only firestore:rules`). Textes CGV/confid.
mentionnant le crypto laissés en place (« le cas échéant » = conditionnel, non
trompeur ; à retirer si suppression définitive un jour).

## Tableau de bord admin — Analytics maison (17/07/2026, SW v326, mergé master)
Fiche + plan : `pirates-tools/docs/PLAN-DASHBOARD-ADMIN.md`. Mesure d'audience
PREMIÈRE PARTIE (pas de GA4/traceur pub), agrégats (pas de log brut), IP jamais
stockée. 6 étapes, 1 commit chacune, tout vérifié (Playwright + émulateur +
unitaires check-analytics en CI).
- ✅ É1 socle serveur : api/events.js (POST public, rate-limit, validation anti-PII,
  géo en-têtes Vercel) → agrégats Firestore via api/_lib/analytics.js (logique
  PURE). Collections analytics_* server-only (rules). 34/34 émulateur.
- ✅ É2 émission client : beacon sendBeacon branché sur track(). 2 niveaux CNIL :
  ANONYME (sessionStorage, exempté) + CONSENTI (localStorage 13 mois → nouveau/
  récurrent + affinité produit). Bandeau reformulé (perso = avec accord). Temps/
  article (view_item→pagehide), clics data-track (dock/chips/WhatsApp). 16/16.
- ✅ É3 API admin : GET /api/admin?type=stats|clients (requireAdmin). summarize()
  pure. Clients = users/ + count() commandes.
- ✅ É4 UI : onglets admin Statistiques (compteurs, appareils/sources, top
  produits+temps, clics, provenance) + Clients (cartes). 16/16.
- ✅ É5 globe 3D : three.js (ensureThree, aucune texture externe), points par
  pays (repli COUNTRY_LATLNG DOM-TOM), surcouche non bloquante, destroy propre
  (0 fuite WebGL). 11/11 (THREE mocké + dégradation).
- ✅ É6 rapport mensuel : api/cron-report.js (Vercel Cron 1er du mois, auth
  CRON_SECRET OU admin) → mail Resend (résumé HTML + PIÈCE JOINTE JSON
  analysable) + purge daily>14 mois / visiteurs>13 mois. Bouton admin « recevoir
  maintenant ». 12/12 (Firestore mocké + Resend intercepté).
⚠️ ACTIONS USER (Vercel) pour activer pleinement :
  - `CRON_SECRET` (env) sinon le cron mensuel refuse (401) et n'envoie rien.
  - `FIREBASE_SERVICE_ACCOUNT` (déjà là), `RESEND_API_KEY`/`RESEND_FROM`/
    `OWNER_EMAIL` (déjà là) pour le mail.
  - Déployer firestore.rules (analytics_* fermées) — même action S1 en attente.
NOTE consentement : la couche ANONYME tourne sans consentement (exemption CNIL
mesure d'audience 1re partie) ; le profil persistant/affinité + nouveau/récurrent
n'existe QUE si l'utilisateur accepte. Refuser = pas de localStorage pt:vid.

## 🔒 RÈGLES PACKS 3D — GRAVÉES (ne JAMAIS y déroger, vérifié par l'user)
Deux exigences NON NÉGOCIABLES pour composer un pack (fusion outil + chargeur +
2 batteries + coffret). Erreurs déjà commises et reprochées → garde-fous codés
dans `scratchpad/_gltftools/pack-build.mjs` (builder paramétré).
1. ORIENTATION DE L'OUTIL = MÊME SENS QUE DCF887P2 (référence approuvée) :
   chuck/enclume à GAUCHE, logo DEWALT FACE caméra, outil DEBOUT sur sa batterie.
   JAMAIS le dos, JAMAIS un logo miroir. La bonne rotationY DÉPEND de chaque GLB
   (orientation native différente) → OBLIGATION de rendre l'outil seul en 4×90°
   depuis la caméra fiche (`scratchpad/_orient.js <glb>`) et de CHOISIR à l'œil
   la vue qui matche la référence AVANT de composer.
   ⛔ RÈGLE ABSOLUE (l'user l'a répété, ne PLUS la violer) : une orientation
   validée est GRAVÉE ici. On NE la re-choisit JAMAIS, on NE la re-derive JAMAIS
   à l'œil. On lit ce REGISTRE d'abord ; si l'outil y est, on prend la valeur
   telle quelle. Nouvel outil seulement → grille 4×90, l'user tranche, ON L'ÉCRIT
   ICI IMMÉDIATEMENT.
   ┌─ REGISTRE ORIENTATIONS VALIDÉES (rotationY sauf mention) ──────────────────
   │  DCF887N (dcf887n.glb) ............ rotY 0   (réf. « chuck gauche/logo face »)
   │  DCF894N (dcf894n.glb) ............ rotY 90
   │  DCF850N (DCF850N.glb) ............ rotY 0
   │  DCD796  (dcd796.glb) ............. rotY 90  (rotY 0 = logo MIROIR → non)
   │  DCH273  (DCH273.glb, perfo) ...... rotY 0
   │  DCG405N (dcg405n.glb, meuleuse) .. rotX 90 + rotY 270  (DEBOUT sur batterie)
   │  DTW300Z (DTW300Z.glb, boul. Makita) rotY 90  (poster solo)
   │  DCF899NT (DCF899NT.glb, boulonneuse) rotY 90  ⬅ validé user 21/07 (PAS rotY 0)
   │  DCD996  (DCD996.glb) ............. quaternion figé [0.1349,0.6941,-0.1349,
   │        0.6941] (pose « redressée » validée ; baké via bake-rot.mjs). Ce n'est
   │        PAS un simple rotY — c'est la pose exacte choisie sur la planche _lean.
   └────────────────────────────────────────────────────────────────────────────
   NB DCD796 : à rotY 0 logo miroir. Le sens homogène (chuck gauche, logo face)
   prime. Les boulonneuses (DCF894, DCF899, DTW300Z) = rotY 90.
2. MAPPING AU SOL VERROUILLÉ : chargeur + 2 batteries + coffret sont les MÊMES
   objets sur tous les packs → placés aux COORDONNÉES EXACTES du mapping validé
   DCF887P2 (docs/PACK-3D-LAYOUT.md), JAMAIS recalculés. Constantes MAP dans le
   builder : case(-40,-122) charger(-80,157) bat1(8,168) bat2(84,162)
   tool(168,209). Principe user : « copier le pack, ne changer QUE l'outil ».
   Avec les bonnes orientations, les 3 outils tiennent à la position mapping
   EXACTE (décalage 0 mm). Le décalage droite auto (1 mm/pas) n'est qu'un filet
   de sécurité si un outil futur, plus gros, chevauchait un accessoire.
3. ANTI-CHEVAUCHEMENT : le builder PLANTE (exit 2) si l'emprise XZ de l'outil
   touche un accessoire (clairance < 8 mm). Interdiction formelle de livrer un
   pack où deux objets se chevauchent. Vérif finale par rendu three.js.
Refaire un pack = `node pack-build.mjs <toolFile> <toolMax_mm> <rotYdeg> <out>`.
4. POSTER 2D (image de la CARTE) = collage `scratchpad/collage-pack.js`. MÊME
   principe : coffret + chargeur + 2 batteries (images objs/*.png + slots RECTS)
   INCHANGÉS, on ne swappe QUE l'image de l'outil. L'outil est rendu à la caméra
   poster (0.8,0.42,0.7) + la MÊME rotY que le pack (chuck gauche, logo face) via
   `scratchpad/_tools_poster.js`, puis dimensionné à la HAUTEUR de réf (502px,
   base y=721, centré x=560) pour une présence identique quel que soit l'outil.
   Sortie images/posters/<sku>.webp, branché sur products.json .img.

## Session packs multi-outils + DCD996P2 (21/07/2026, SW v354, mergé master)
5 nouveaux GLB uploadés par l'user (rangés racine→models/products/) : DCD996,
DCH273 (=DCH273N doublon supprimé), DTW300Z, DCP580N (doublon supprimé).
Packs composés (builders scratchpad/_gltftools/) :
- DCK266P2T (DCD796+DCF887) : pack 2-outils AVEC coffret (vendu en T STAK) →
  pack-build2.mjs (gap -20, décalage cluster -50). Poster collage 2-outils.
- PPACK0001 (DCF887 + meuleuse) et PPACK0002 (DCF887 + perfo DCH273) : SANS
  COFFRET (règle user : « 2 outils + 2 batteries + chargeur = pas de boîte ») →
  pack-build2-nc.mjs : 2 outils DEBOUT en arrière (centrés, décalés gauche -70,
  relevés/reculés TZB 40 pour ne pas toucher les batteries), batteries à gauche
  + chargeur à droite en rangée avant (compo photo réf user). Le PERFO doit être
  BEAUCOUP plus gros que la visseuse (DCH273 realMax 245 vs 180). Meuleuse
  DEBOUT = rotX 90 / rotY 270.
- ⚠️ ERREUR ÉVITÉE : 2 meuleuses au catalogue — DCG405N (tête standard, dcg405n.glb,
  = celle du pack) vs DCG405FN-XJ (tête PLATE, DCG405FN.glb, produit séparé).
  Le pack PPACK0001 = DCG405N. Ne pas confondre.
- DCD996P2-QW (perceuse DCD996 SEULE, 1 outil AVEC coffret) : pack-build.mjs.
  DCD996 « de travers » dans le GLB → pose choisie par l'user via planche
  d'inclinaisons (rotateOnWorldAxis avant+droite), quaternion figé
  [0.1349,0.6941,-0.1349,0.6941] (support QUAT env dans pack-build.mjs) ;
  outil décalé +40 mm à droite (TOOLDX) pour dégager les batteries.
- POSTERS carte : PPACK0002 = PNG fourni par l'user (compo perfo+visseuse, logos
  OK 2e version) ; les autres = collages (collage-pack2.js avec coffret,
  collage-duo-nocase.js sans coffret : 2 outils haut, batteries bas-gauche,
  chargeur bas-droite). Fiche = TOUJOURS le modèle 3D qui tourne.
RESTE : DTW300Z / DCP580N pas encore branchés (outils nus, à faire au besoin).

## Session perf affichage 3D + fiche produit (21/07/2026, SW v373→v376, mergé master)
- ✅ v373 FICHE PRODUIT (décision produit user) : héros plein écran = POSTER
  statique (plus aucun GLB au chemin critique) ; le SEUL modèle 3D est le petit
  carré « vue détail » en loading="lazy" (charge au scroll). setPdpViewer(v,
  alt, load3D). Fin du double téléchargement/décodage du même GLB par 2 viewers.
  (1re tentative v373 « SW cache-first modèle + préchargement » ABANDONNÉE/revert.)
- ✅ v374 = numéro de cache NEUF (deux contenus différents avaient été publiés
  sous v373 → mélange stale/frais). RÈGLE : jamais réutiliser un numéro.
- ✅ v375 TITRES FICHE : .pdp-hero height calc(100dvh - var(--safe-top) - 10px)
  (le héros débordait de 80px = padding-top de #app → bandeau « Économisez »
  coupé STRUCTURELLEMENT) ; titre clamp réduit (60,8px/3 lignes → 36,8px/2) ;
  info padding bas 2,5rem. 20/20 assertions Playwright 4 viewports.
- ✅ v376 ACCUEIL (audit profond v371→v375 demandé par l'user) : AUCUNE
  régression de code accueil sur la plage MAIS défaut structurel ancien : le
  carrousel « Outils 3D » (eager + src à l'init + getMvPreloadIO 700px, or il
  est à ~1200-1400px du haut = dans la marge dès l'ouverture) téléchargeait
  script + 1er GLB pack 2,45 Mo À CHAQUE visite sans scroll (~2,75 Mo). Fix :
  cap 10 modèles (décision user), loading="lazy" (GLB seulement quand visible),
  IO dédié _3dScriptIO 200px (script seul), poster produit affiché pendant le
  streaming. Harnais réseau : ouverture = 0 octet 3D.
- LEÇON MESURE : l'user navigue TOUJOURS en privé (cold load intégral à chaque
  visite) → le SW/cache ne l'aide jamais ; seul le poids brut compte pour lui.
- OUTILS scratchpad : ab-home.mjs (A/B boot accueil), pdp-render.mjs +
  pdp-verify-fix.mjs (géométrie fiche 4 viewports), home-net.mjs (interception
  réseau accueil/carrousel), banner-pos.mjs (position carrousel vs IO).
- NOTE : minification app.js/styles.css évoquée puis ÉCARTÉE par l'user
  (« pas besoin ») après retour à la vitesse normale. Option future.

## Session paiement des courses + escrow livreur (26/07/2026, SW v476)
DÉCISION USER GRAVÉE : le client PAIE sa commande quincaillerie + livraison EN
LIGNE, EN UNE FOIS (même modale carte que les outils). L'argent est ensuite
VENTILÉ : produits → owner ; frais de livraison → GELÉS (escrow) puis reversés
à 100 % au livreur quand (1) le livreur a marqué « livrée » avec PHOTO
OBLIGATOIRE prise sur place (anti-arnaque des 2 côtés) et (2) le client a
confirmé la réception. Zéro bénéfice plateforme sur la course.
- `api/_lib/courses.js` (NOUVEAU, source unique) : DEPOT/BAREME/quote (zone+prix
  serveur depuis lat/lng), createFromIntent (doc courses/ id = pi.id →
  IDEMPOTENT webhook ↔ repli /merci, jamais de doublon), alertNewCourse,
  TEST_EMAILS. Testé 12/12 (barème réel Gosier/Basse-Terre, rejeu sans doublon).
- create-payment-intent : body.course {lat,lng,address,date,when,hour} →
  territoire 971 obligatoire, zone/frais AUTORITAIRES serveur ajoutés au
  montant débité (remise fidélité = produits seuls), metadata course*.
- webhook : rebuildLines ajoute la ligne « Livraison sur chantier — zone X
  (reversée intégralement au livreur) » (intégrité au centime conservée,
  testée) ; payment_intent.succeeded avec courseZone → crée la course + alerte.
- contact.js : course-create EXIGE paymentIntentId (vérifié chez Stripe :
  succeeded + source + courseZone + uid du payeur) — IMPOSSIBLE de commander
  sans payer ; course-deliver (livreur accepté, photo data-URL JPEG compressée
  client ≤700 Ko, statut acceptee→livree, email client « confirme ») ;
  course-confirm (client, livree→terminee, escrow gele→liberable/libere ;
  transfer Stripe Connect AUTO si couriers/{uid}.stripeAccountId existe, sinon
  email owner « X € à verser » = virement manuel en attendant Connect) ;
  course-proof (photo visible artisan/livreur seulement).
- app.js : bouton « Commander la livraison » (fiche QC + page livraison) ouvre
  openPayModal(items, courseCtx) — adresse chantier BAN préremplit le
  formulaire (street/postcode/city stockés dans _ptGeo), ligne 🛵 livraison
  affichée, /merci finalise course-create avec la preuve ; espace livreur =
  statuts + « 💰 gelés/débloqués/versés » + bouton photo (lvCompressPhoto
  canvas 1100 px JPEG) ; espace client = total payé, photo du livreur, bouton
  « ✅ Confirmer la réception », notation aussi sur terminee.
- STEPPER QUANTITÉ (fiches quincaillerie SEULEMENT) : pilule − / n / + dorée
  (#pdpQtyWrap, §50 CSS), pilote ajout panier (addToCart addQty), achat direct
  et livraison. Masqué sur les machines. Harnais Playwright 10/10.
- REMISE SÉCURISÉE (26/07 soir, SW v477, demande user « QR/numéro unique +
  photos croisées ») : chaque course PAYÉE porte un **code de remise 6 chiffres**
  (crypto.randomInt, généré dans createFromIntent) visible UNIQUEMENT par le
  client (course-list ne le joint que si artisanUid===uid ; jamais dans la
  liste dispo ni les emails livreurs). Le client l'affiche en clair + **QR
  généré 100 % local** (ensureQRLib/cryptoLocalQR réutilisés) dans Mes
  livraisons, et le donne EN MAIN PROPRE contre le colis. course-deliver EXIGE :
  le bon code (sinon 403 code-invalide) + 2 photos (colis remis + vue large du
  chantier colis posés). Le CLIENT doit joindre une **photo du chantier à la
  commande** (widget : bouton obligatoire, compression locale, sessionStorage
  pt_course_scene à travers le paiement → course-scene après création) — le
  livreur la voit pour repérer le dépôt, et à la livraison le client compare
  les 3 photos (grille lv-proof__grid) avant de confirmer. Photos stockées en
  SOUS-COLLECTION courses/{id}/photos/{scene|remise|chantier} (limite 1 Mio/doc
  Firestore — 2 photos dans le doc course la crèveraient) ; accès via
  course-proof (artisan/livreur de la course seulement) ; rules default-deny
  couvrent les sous-chemins. Courses legacy sans code : contrôle sauté.
- VIDÉOS DE PROTECTION MUTUELLE + LITIGES (26/07 nuit, SW v478, demande user) :
  vidéo de remise OPTIONNELLE des deux côtés (le livreur peut filmer la remise,
  le client peut en déposer une dans le litige) → **Firebase Storage** (les
  vidéos ne tiennent pas dans Firestore) : storage.rules versionnées
  (default-deny ; write = participants de la course via lecture croisée
  firestore.get, ≤120 Mo, video/* ; read/delete client = JAMAIS), firebase.json
  branche storage, firebase-init.js expose loadStorage() (module Storage chargé
  À LA DEMANDE, 0 octet au boot). Upload SDK direct (uploadBytesResumable +
  progression %) puis référence journalisée via contact.js course-video
  (participant only, chemin validé courses/{id}/videos/, max 6). LITIGE :
  course-dispute (client OU livreur, message ≥10 car., un seul ouvert à la
  fois) → email owner ; bloc UI partagé lvVideoDisputeHtml/wireVideoDispute
  (les 2 espaces). ADMIN (onglet Livreurs → « Litiges & vidéos ») :
  admin.js course-disputes = liste courses avec litige/vidéos + **URL signées
  1 h** (admin.storage().bucket('pirates-tools.firebasestorage.app')) ;
  course-dispute-close = clôture + décision + **suppression définitive des
  vidéos** (deleteFiles prefix) — engagement affiché partout : vidéos privées,
  jamais publiées, admin seul, effacées à la clôture. CONSENTEMENT obligatoire
  des 2 côtés : case 🎥 dans les 2 widgets de commande client (bloque la
  commande sinon) + case 🎥 dans le dossier livreur (bloque l'envoi sinon).
  ⚠️ ACTION USER au lancement : activer Storage (console Firebase → Build →
  Storage) puis `npx firebase deploy --only storage` — sans ça l'upload vidéo
  échouera proprement (message d'erreur, le reste de la chaîne fonctionne).
- STRIPE CONNECT (à faire au lancement) : onboarding Express des livreurs
  (KYC Stripe + IBAN) → poser stripeAccountId dans couriers/{uid} → les
  versements deviennent 100 % automatiques. Sans Connect, on NE PEUT PAS
  détenir l'argent des livreurs légalement à long terme (encaissement pour
  compte de tiers) — le gel actuel sur notre solde + virement manuel est
  acceptable en TEST uniquement.

## 🛵 LIVREURS INDÉPENDANTS — fiches publiques, tarifs libres, chat (27/07/2026, SW v495)
Demande user : carte des zones EN GRAND en tête du « Mode livraison » où le
livreur inscrit SES prix ; cartes livreurs comme les artisans (accueil + page
Livraison) menant à un PROFIL vue client (carte de ses tarifs, compteur de
courses, notes et avis) ; bouton « disponible » qui allume le bandeau vert ;
le 1er livreur qui accepte ouvre un CHAT avec le client.
⚖️ RAISON DE FOND (pas cosmétique) : c'est la pièce 1 de LA PARADE
(docs/METHODE-ENTREPRISE-FISCALITE.md § 5 bis) — la plateforme ne doit plus
FIXER le prix, sinon art. L7342-1 + critère de présomption de salariat de la
directive (UE) 2024/2831 (transposition avant le 02/12/2026). LV_BAREME
(22/48/74/100 €) devient un **repère indicatif** pré-rempli ; le livreur met ce
qu'il veut (1→500 € = garde-fous anti-faute de frappe, pas un barème) et
**AUCUNE sanction ni tri ne dépend du montant** — le tri de l'annuaire est
dispo → note → ancienneté, JAMAIS le prix (vérifié dans loadCouriers).
- **Modèle de données** : `couriers/{uid}` reste PRIVÉ (KYC, email, Stripe
  Connect) ; nouveau `couriers_public/{uid}` = miroir PUBLIC écrit par l'Admin
  SDK seul (nom, photo, commune, véhicule, tarifs, available, coursesDone,
  ratingCount/Sum, avis[20 max]). Lecture publique via le SDK client (même
  schéma que `partners/` — plan Vercel Hobby saturé à 12/12 fonctions, donc
  AUCUN nouvel endpoint : tout passe par contact.js).
- **API (contact.js)** : `courier-profile` (lire la sienne), `courier-profile-save`
  (nom/commune/véhicule/bio/photo ≤300 Ko/tarifs), `courier-available`
  (interrupteur ; refuse si la fiche n'a pas de nom). `course-rate` agrège la
  note + l'avis (SANS nom ni email du client — RGPD) ; `course-confirm`
  incrémente `coursesDone` → un livreur ne peut RIEN gonfler lui-même.
- **CHAT** : `courses/{id}/messages`, écrit DIRECTEMENT par le SDK client sous
  règles (participants seuls, messages IMMUABLES = preuve en cas de litige,
  ≤800 car., uid == request.auth.uid, hasOnly 4 champs). Temps réel via
  `onSnapshot` (ajouté à firebase-init.js). `course-accept` pose `chatOpen:true`
  + `courierName` et écrit l'amorce système. Coût serverless : ZÉRO.
- **UI** : `renderCourierTarifPanel()` en tête de #/mode-livraison (carte SVG
  pleine largeur, prix inscrits DANS les anneaux, mise à jour en direct à la
  frappe) ; `courierCardHTML` + `#couriersGrid` (page Livraison) +
  `#couriersStripSection` (accueil) ; nouvelle route `#/livreur-profil/{uid}`.
- VÉRIFIÉ : 35/35 Playwright (scratchpad/couriers.mjs) + **72/72 émulateur
  Firestore réel** (scripts/test-rules.js, dont 22 nouvelles assertions).
- ⚠️ **ACTION USER OBLIGATOIRE** : `npx firebase deploy --only firestore:rules`
  (ou console iPad). Tant que ce n'est pas fait, l'annuaire livreurs et le chat
  RESTENT VIDES/MUETS — les nouvelles règles ne sont pas en ligne.
## 📨 DEMANDE DE COURSE SANS PAIEMENT — mise en relation pure (27/07/2026, SW v496)
DÉCISION USER : « le client fait une demande de courses, il ne paye rien avant
donc on enlève le panneau de paiement ». C'est la SORTIE COMPLÈTE de L7342-1 :
la plateforme ne fixe plus le prix (fait en v495) ET n'encaisse plus rien.
- **Flux** : demande déposée (aucun débit) → visible de TOUS les livreurs →
  1er qui accepte = chat ouvert + la course quitte la liste « disponibles »
  (l'alerte s'arrête d'elle-même) → ils conviennent du prix et des modalités →
  si ça ne colle pas, l'un OU l'autre clique « remettre en ligne » → la demande
  repart chez tous (email `alertCourseAgain`). Le client peut ANNULER sa
  demande à tout moment (confirmation en 2 temps, anti-tap accidentel).
- **`round` = LA trouvaille** : chaque remise en ligne incrémente `round` sur la
  course. Les règles Firestore n'autorisent lecture/écriture des messages QUE
  du round courant → **le livreur suivant ne lira JAMAIS la conversation
  d'avant**, et l'ex-livreur perd tout accès. Corollaire OBLIGATOIRE côté
  client : la requête doit filtrer `where('round','==',round)`, sinon Firestore
  refuse la requête entière (elle serait trop large). `where` ajouté à
  firebase-init.js.
- **API (contact.js)** : `course-request` (rate-limit 10/h/compte, zone dérivée
  serveur de lat/lng, AUCUN champ `prix`), `course-release` (participant,
  acceptee→en_attente, round+1, détache le livreur), `course-cancel` (client,
  en_attente|acceptee→annulee). Les trois refusent si `paid` (les anciennes
  courses pré-payées gardent l'ancien chemin litige/escrow).
- **Prix affichés** : côté livreur, chaque course montre SON tarif de zone
  (`lvMyPrice`) ; côté client, « prix à convenir dans la discussion ». Le
  barème LV_BAREME n'apparaît plus qu'en « ~ » (repère).
- **Ce qui reste en place** : photo du chantier obligatoire (jointe juste après
  la demande via course-scene), code de remise 6 chiffres + QR, 2 photos du
  livreur, consentement vidéo, litiges, notation. Seul le PAIEMENT a disparu du
  parcours livraison.
- **Code de paiement conservé mais plus appelé** : `openPayModal` garde sa
  branche `_payCourse` et `/merci` garde `course-create` (paiement prouvé) —
  plus rien ne les déclenche côté livraison. La modale carte sert toujours à
  l'achat d'outils. NE PAS les supprimer sans revoir le webhook.
- VÉRIFIÉ : **47/47 Playwright** (dont « AUCUN panneau de paiement ne s'ouvre »,
  demande sans prix, photo jointe, release, annulation 2 temps, filtre round)
  + **78/78 émulateur Firestore** (dont 4 assertions de cloisonnement round).
## 📝 L'ACCORD + PAIEMENT DE LA MARCHANDISE (27/07/2026, SW v497)
DEMANDE USER : un bouton dans le chat pour écrire noir sur blanc ce que les deux
ont convenu, un formulaire que les DEUX acceptent, avec le mode de règlement du
livreur ; et AVANT validation, le client doit payer SA MARCHANDISE à l'owner —
une fois payée, la course est réellement commandée. Le tout dans une COLONNE
DE BOUTONS à droite du chat, chacun ouvrant un panneau dédié.
- **Séquence complète** : demande (0 €) → 1er livreur accepte → chat → 📝 accord
  (prix + mode de règlement + date/heure + point de dépôt + précisions) → l'autre
  accepte → 💳 le client règle SA MARCHANDISE à Pirates Tools → `status:'confirmee'`
  = course réellement commandée → livraison (code + 2 photos) → confirmation.
- **Séparation des deux argents — LE point juridique** : Pirates Tools encaisse
  UNIQUEMENT la marchandise (notre vente). Le prix de la course est convenu
  entre eux et réglé EN DIRECT (`virement` = facturation classique, ou
  `especes` en main propre). Aucun euro de course ne transite par nous.
- **API** : `course-accord-propose|accept|reject` (participants, status
  'acceptee', prix 1→2000 € = garde-fou de frappe, PAS un barème), et
  `course-goods-paid` (vérifie chez Stripe : succeeded + uid + `courseRef`
  posé par create-payment-intent via `body.courseId`). Chaque étape écrit un
  message SYSTÈME immuable dans le fil → l'accord est tracé.
- **UI** : `lvChatHTML(c, role)` en 2 colonnes ; `lvPanelAccord/Pay/Code/Release`.
  Pastilles d'état sur les boutons ; le panneau qui attend une action de MOI
  s'ouvre TOUT SEUL (sur iPad, un bouton à penser à toucher n'est pas vu).
  `openPayModal(items, courseCtx, {goodsCourseId})` → `sessionStorage
  pt_goods_course` → /merci appelle `course-goods-paid`.
- **`course.lines`** ({key,qty} seulement) est enregistré à la demande : le
  paiement se reconstruit même si le panier a été vidé (les prix viennent
  TOUJOURS du catalogue serveur).
- 🐛 **2 VRAIS BUGS attrapés par le harnais, à retenir** :
  1. `var el` PARTAGÉ réassigné par les `if ((el = panel.querySelector(...)))`
     successifs → au clic, `el` pointait sur le dernier résultat (null).
     Chaque bouton capture désormais SON élément.
  2. **Course d'authentification** : `renderCourierSpace` lisait `_currentUser`
     avant le 1er verdict de `onAuthStateChanged` → au chargement à FROID le
     livreur était éjecté vers #/mes-livraisons. Ajout de `whenAuthReady()`
     (attend `_authReady`, plafond 5 s), utilisé par `lvGetRole` ET
     `renderClientDeliveries` (qui affichait « Erreur » sur un 401).
     ⚠️ Bug de PRODUCTION, pas d'artefact de test.
  3. PIÈGE HARNAIS : deux `page.goto()` sur la MÊME URL = navigation
     same-document, AUCUN rechargement → l'app ne se ré-initialise pas et on
     teste l'état précédent. Toujours varier l'URL (`?b=N`).
- VÉRIFIÉ : **63/63 Playwright** + **78/78 émulateur** (règles INCHANGÉES
  depuis v496 — l'accord vit sur le doc course, écrit par l'Admin SDK seul).
- ⏭️ RESTE À DÉCIDER : rien de bloquant côté argent — la plateforme ne touche
  plus à l'argent de la course. Stripe Connect deviendra utile seulement si
  l'user veut un jour proposer le paiement de la course en ligne (facultatif).

## 🔎 AUDIT APRÈS DÉPLOIEMENT DES RÈGLES (27/07/2026, SW v498) — 9 DÉFAUTS CORRIGÉS
User : « fais un check-up… recherche approfondie de bugs, d'erreurs ou de
mauvaises architectures ». Règles Firestore déployées par l'user juste avant.
Revue ligne à ligne des 3 sessions précédentes → **9 défauts RÉELS**, dont 4
auraient cassé le parcours en production. Tous corrigés + testés.
- 🔴 **INDEX FIRESTORE MANQUANT (le plus grave)** : le chat faisait
  `where('round','==',n) + orderBy('at')` → **index composite obligatoire**,
  absent de firestore.indexes.json → `FAILED_PRECONDITION` en prod, chat mort.
  ⚠️ **INVISIBLE EN TEST : l'émulateur crée les index à la volée.** Correctif
  choisi = SUPPRIMER le besoin (filtre `round` seul, tri fait en JS sur ≤300
  messages) plutôt qu'ajouter une étape de déploiement d'index à l'user.
  **RÈGLE À RETENIR : toute requête `where` + `orderBy` sur 2 champs différents
  exige un index composite — l'émulateur ne le dira jamais.**
- 🔴 **Le livreur ne pouvait PAS valider une livraison** : le bloc des 3 preuves
  était conditionné à `status === 'acceptee'`, or le flux courant passe en
  `'confirmee'`. Idem vidéo/litige. Helper `lvLivrable(c)` = miroir exact du
  contrôle serveur.
- 🔴 **Le client perdait son code de remise** au statut `'confirmee'` — pile au
  moment où il en a besoin.
- 🔴 **`undefined €` partout** : `c.prix` n'existe plus sur une demande. Helper
  unique `lvPrixTxt(c)` (payé → montant réel ; accord → prix convenu ; sinon
  « prix à convenir »), appliqué aussi à l'admin et aux popups de carte.
- 🟠 **Livrer une course non confirmée était possible** (serveur) : `'acceptee'`
  n'est désormais livrable QUE si `paid` (courses legacy).
- 🟠 **Note publique avant toute livraison** : `course-rate` acceptait
  `'acceptee'` → un client pouvait noter un livreur qui n'avait rien fait, et
  ça alimentait sa fiche PUBLIQUE. Restreint à `livree|terminee` (client aligné).
- 🟠 **Rôle livreur mis en cache À VIE** (`_lvRolePromise`) : survivait à un
  changement de compte. Réinitialisé dans `onAuthStateChanged` (+ `_lvMyTarifs`,
  + désabonnement du chat).
- 🟠 **Fuite de l'abonnement `onSnapshot`** du chat : jamais coupé en quittant la
  page. Teardown ajouté dans `onRouteChange` (même endroit que le globe admin).
- 🟠 **Course de données sur les tarifs** : la liste des courses pouvait être
  peinte AVANT le chargement du profil → le livreur voyait le repère 22 € au
  lieu de SON tarif. `renderCourierTarifPanel()` renvoie une promesse, les deux
  requêtes partent en parallèle mais l'affichage attend les deux.
- 🟠 **`admin course-delete` n'effaçait pas la sous-collection `messages`**
  (Firestore ne supprime jamais les sous-collections d'un doc supprimé) → la
  conversation survivait indéfiniment, inaccessible mais stockée.
- ⚪️ Widget « Mes gains » réécrit : afficher un solde 0 € laissait croire qu'on
  retient l'argent des livreurs. Il compte les courses terminées et rappelle
  que le client règle en direct.
- VÉRIFIÉ : **76/76 Playwright** (couriers.mjs) + **14/14** (course-pay.mjs,
  zéro régression sur la modale de paiement outils) + **78/78 émulateur**.

## 💳 STRIPE EN MODE TEST (26/07/2026, SW v481) — À INVERSER AU LANCEMENT
Avant lancement, le site tourne sur les clés **TEST** de Stripe (compte activé
non requis) pour permettre à l'user de dérouler la chaîne complète course :
photo chantier → paiement → course → code/QR → livreur → confirmation.
- `index.html` : `PT_STRIPE_PK` = `pk_test_51TJYJVPynqHG9OET…` ; la clé LIVE est
  conservée EN COMMENTAIRE juste au-dessus (ne pas la perdre).
- Vercel : `STRIPE_SECRET_KEY` = `sk_test_…` (posée par l'user).
- Carte de test : **4242 4242 4242 4242**, date future, CVC quelconque.
- ⚠️ PIÈGE MAJEUR : la clé vit dans un **script inline autorisé par empreinte
  sha256** (H1). Changer la clé change le hash → `node scripts/check-csp.js`
  devient rouge et, non corrigé, la CSP BLOQUE le script en prod (site cassé,
  aucun PT_STRIPE_PK). Procédure : éditer index.html → lancer check-csp →
  remplacer le hash obsolète dans `vercel.json` → re-vérifier.
- AU LANCEMENT : remettre `pk_live_…` dans index.html, `sk_live_…` sur Vercel,
  recalculer l'empreinte CSP, poser `STRIPE_WEBHOOK_SECRET`.
- NOTE : le webhook n'est PAS requis pour tester — /merci vérifie le paiement
  chez Stripe et crée la course (repli idempotent, doc id = pi.id).

## Vérification standard
`cd pirates-tools && node scripts/ci.js` doit rester vert après chaque étape.
Bump SW (`sw.js` VERSION + ASSET_VER) et `?v=` dans `index.html` à chaque changement d'asset.

## Rappels techniques
- app.js = un seul IIFE (~6172 lignes), style ES5 var/function.
- Cache-busting : VERSION + ASSET_VER + ?v= doivent être alignés.
- Ne jamais commiter de secret serveur côté client (clés publishable Stripe OK).

## Session catalogue produits (18/07/2026, SW v336, mergé master)
Peuplement du catalogue à partir de captures Cotébrico/Screwfix (l'user envoie
par lots de 5). Modèle de prix TRANCHÉ : `price_ht` = coût HT fournisseur × 1,15
(marge 15 %, PROMOS IGNORÉES) ; `price` = price_ht × 1,20 (TTC métropole
d'affichage). Le serveur re-dérive le TTC territorial (octroi + TVA DOM via
calcPrice/pricing.js). Libellés stock laissés « En stock » (décision user :
délais affichés au paiement, pas via le badge — futur chantier frais de port).
- Lot 1 (session précédente) : 5 DeWALT (packs/rabot/souffleur/aspi).
- Lot 2 : +4 DeWALT (DCK266P2T + 3 packs énergie FLEXVOLT) ; DCF887N existant
  réaligné 129€→94€ (marge ~88 %→15 %) + specs enrichies. Catégorie
  « Batteries et chargeurs » créée.
- Lot 3 : +5 DeWALT (2 perforateurs FILAIRES tag corded, batterie DCB184,
  DCD996P2, visseuse placo DCF620 moteur À CHARBONS). Catégorie
  « Perforateurs » créée.
- BUG specs INVISIBLES corrigé (v334) : `.pdp-specs-table tr` en opacity:0
  révélé au scroll, mais initPdpScrollAnimations() était appelé AVANT
  l'injection features/specs/kit → nouvelles lignes jamais animées (bloquées
  invisibles). Fix : appel APRÈS injection. Latent jusqu'ici car les 26
  produits d'origine avaient une table vide. + bloc « Caractéristiques » masqué
  quand aucune spec (v333, grille 3D recentrée .pdp-split--solo).
- SPECS ANCIENS PRODUITS (v335) : 22/25 remplies via recherche web fiches
  constructeur (4 agents // : DeWALT/Makita/Festool+Flex/Facom+Stanley+Wera).
  Corrigés fidèlement : DCS391N = À CHARBONS (pas brushless), TSC55 = bi-tension
  36 V. Voir specs-*.json dans scratchpad si re-run nécessaire.
- 3 fiches FANTÔMES SUPPRIMÉES (v336, validé user) : Stanley FMC645D2 (réf. =
  visseuse à chocs, pas scie sauteuse), FMC688L2 (réf. = batterie, pas
  perceuse), Facom CL2.C18S (SKU inexistant). Catalogue 40→37, TOUS avec specs.
- 2 fiches SKU-imprécis GARDÉES à vérifier par l'user → voir « À FAIRE PLUS
  TARD » (Facom CL3.C18SP, Flex FW1/2-502).
- DCG405FN-XJ (meuleuse tête plate, ~20/07) : prix dérivé d'AMAZON (176,24€
  TTC → HT 146,87 × 1,15) car INTROUVABLE sur Cotébrico. Prix VALIDÉ par l'user
  (« on s'aligne sur ce prix pour l'instant ») — PAS une erreur. À ajuster
  seulement SI l'user trouve moins cher un jour (il préviendra).
- 3D branchée aux fiches par lots (GLB uploadés par l'user sur master, nommés
  par SKU). Règle : rendu outil-seul UNIQUEMENT sur versions nues ; kits P2/P2T/
  D2K = modèles composés (fournis plus tard) → GLB seul retiré des kits
  DCF894P2/DCF887P2/DCF850P2T/DCD796P2. Poids GLB cible ≤1,5 Mo (2,5 max).

## Session packs 3D — modèle interactif fusionné (20/07/2026, SW v351, mergé master)
EXIGENCE USER NON NÉGOCIABLE : « toutes les fiches produits doivent contenir le
modèle qui tourne et pas le poster ». Pour les kits (P2/P2T/D2K = plusieurs
objets), il faut donc FUSIONNER les composants GLB en UN seul modèle, et
compresser « un tout petit peu » si trop lourd.
- ✅ DCF887P2 (1er pack) : fusion de 5 composants (visseuse DCF887N + chargeur
  DCB1104 + 2× batterie DCB184 orientées bat_r90 = Math.PI/2 + coffret TSTAK)
  en `models/products/dcf887p2-pack.glb`. Proportions RÉELLES (outil 180 mm,
  chargeur 150 mm, batterie 85 mm, coffret 430 mm). Disposition compacte :
  coffret centre-fond, outil à droite, chargeur + 2 batteries devant, aucun
  chevauchement. products.json DCF887P2.model branché. Le poster 2D (collage
  images/posters/dcf887p2.webp) RESTE l'image de la CARTE (catalogue rapide,
  0 GLB) ; la 3D ne se charge qu'à l'ouverture de la fiche (setPdpViewer, déjà
  en place). Orbite par défaut model-viewer 25/72 cadre le pack de face-droite.
- PIPELINE (réutilisable pour les autres packs) : `scratchpad/_gltftools/
  pack-merge.mjs` (gltf-transform). mergeDocuments(target,source) — PAS
  doc.merge ; reparent des enfants de scène sous un node wrapper ; getBounds →
  scale sur realMax ; rotationY via quaternion ; layout `pos` compact ; UN SEUL
  buffer (contrainte GLB, consolidation des accessors). Compression : dedup +
  weld + **simplify meshopt ratio 0.3 (erreur 0,1 %)** + draco + textureCompress
  WebP 512². Le maillage était l'ennemi (1,19 M verts → 6 Mo avant décimation),
  PAS les textures (0,4 Mo). Résultat 2,54 Mo (bande acceptable, < plafond 3 Mo).
  meshoptimizer présent dans _gltftools/node_modules (MeshoptSimplifier.ready).
  LEÇON : GLTFExporter three.js DÉCOMPRESSE les textures (→103 Mo, inutilisable) ;
  gltf-transform les garde compressées → seule voie viable.
- VÉRIF : rendu three.js headless (SwiftShader) du GLB décimé à l'angle de
  référence → coffret/outil/chargeur/batteries + logos NETS, 0 perte visible.
- COMPOSITION affinée en 2 retours user puis VALIDÉE (« nickel tu peux
  envoyer ») → mergé master : (1) visseuse = HÉROS au premier plan avant-droit
  (produit principal, doit être le plus visible) ; coffret tourné rotationY
  -90°→0° = DE FACE (loquets/étiquette vers caméra ; -90° montrait le côté =
  « de travers ») ; chargeur+batteries en rangée avant sans occlusion.
  (2) chargeur+2 batteries RAPPROCHÉS de la visseuse (rangée décalée droite +
  resserrée) ; coffret réduit 430→400 mm. RECETTE COMPO (à réutiliser) : caméra
  PDP fixe ≈ azimut 25°/polar 72° (+Z vers caméra, +X à droite) → placer le
  produit principal en +Z/+X (premier plan = héros par perspective), coffret de
  face reculé (-Z) décalé gauche, accessoires en rangée avant étalée en X.
  Orientations vérifiées par rendu 4×90° (_orient.js) : DCF887N héros = rotY 0
  (chuck gauche, logo DEWALT face) ; TSTAK de face = rotY 0.
- 3 AUTRES PACKS COMPOSÉS (20/07, SW v352) via `scratchpad/_gltftools/
  pack-build.mjs` (builder paramétré : MÊME layout gabarit, on ne change que
  l'outil héros — args toolFile/toolMax/rotYdeg/out). Outils de base déjà
  présents (aucun upload user requis) ; chargeur/batterie/coffret partagés.
  Orientation héros trouvée par _orient.js (logo DEWALT face caméra) :
    • DCF894P2 → dcf894n.glb, realMax 190, rotY 0° → dcf894p2-pack.glb (2,57 Mo)
    • DCD796P2 → dcd796.glb, realMax 195, rotY 180° → dcd796p2-pack.glb (2,76 Mo)
    • DCF850P2T → DCF850N.glb (BARE ; dcf850.glb = scène kit éparpillée,
      inutilisable), realMax 165, rotY 180° → dcf850p2t-pack.glb (2,54 Mo)
  products.json .model branché pour les 3. Rendus three.js vérifiés à l'angle
  fiche. RESTE À MODÉLISER par l'user : DCD996 (pack DCD996P2-QW ; ≠ DCD796).
- 🗺️ GABARIT VERSIONNÉ (idée user « quadrillage map au sol pour se souvenir des
  positions ») : `docs/PACK-3D-LAYOUT.md` + `docs/pack-3d-layout-map.svg`
  (carte quadrillée mm, vue de dessus, extraite AUTO du pipeline via
  pack-layout.json). Contient repère caméra, règle héros, coordonnées validées
  (cx/cz/emprise par composant) ET les formules paramétriques relatives au
  coffret → à réappliquer tel quel pour les prochains packs. Vérif orientation
  d'un GLB : `scratchpad/_orient.js` (4 vues à 90°).

## 🛒 LE PANIER N'ÉTAIT PAS ENREGISTRÉ AVEC LA DEMANDE (28/07/2026, SW v527)
CAUSE RACINE d'un bug que j'avais d'abord MASQUÉ (reproche user justifié : « le
bouton régler ma marchandise tu l'as transformé en aller au catalogue, tu te
fous de ma gueule, je t'ai juste dit qu'il ne marchait pas »). Le bouton ne
marchait pas parce qu'il n'y avait RIEN à payer : le POST `course-request`
(app.js) envoyait `productTitle` et `qty` mais **jamais `lines`** — alors que
le serveur les attend depuis toujours (`buildRequest` → `sanitizeLines`). Toute
demande arrivait donc « sans marchandise ».
- ⛔ **LEÇON À NE PLUS REFAIRE** : quand l'user dit « ça ne marche pas », on
  cherche POURQUOI en amont. Désactiver le bouton, expliquer l'absence et
  proposer une sortie (« Aller au catalogue ») = masquer le symptôme. Le
  bandeau orange « déposée sans panier » n'était pas une information, c'était
  l'aveu d'un bug non diagnostiqué.
- CORRECTIF : `lines: pl.items.map(...{key,qty})` dans le POST (aucun prix
  client — le catalogue serveur revalide chaque clé).
- REPLI pour les demandes ANTÉRIEURES (leurs lignes n'existeront jamais) :
  `lvPayLignes(c)` retombe sur la quincaillerie du panier courant, en le
  DISANT. Sans ce repli, ces courses seraient impayables à vie.
- Le bouton « 💳 Payer ma marchandise » ouvre de nouveau la MODALE CARTE
  (`openPayModal(items, null, {goodsCourseId})`). Vérifié : la modale s'ouvre,
  contient le formulaire de carte, et on ne navigue nulle part.

## ⛔ JAMAIS DE BOUTON GRISÉ COMME ÉTAT DE REPOS (28/07/2026, SW v527)
2e reproche user sur le MÊME bouton : « le bouton régler ma marchandise ne
marche pas, il est devenu sombre, je ne peux pas tester ». J'avais remplacé le
bouton mort par un bouton `disabled` — même faute dans un autre costume : ça ne
dit ni ce qui manque, ni quoi faire, et ça bloque le test.
- SON CAS EXACT, à retenir : demande déposée AVANT le correctif `lines`
  (donc `c.lines` vide) **ET** panier effacé — il navigue TOUJOURS en privé et
  ferme le site, donc localStorage est vidé entre deux visites. Le repli
  « panier courant » ne trouvait donc rien non plus. Zéro article chiffrable.
- RÈGLE GRAVÉE : dans ce parcours, un bouton n'est JAMAIS `disabled` au repos.
  Il est toujours actif et a toujours un effet VISIBLE — soit il ouvre la
  modale carte, soit il emmène là où on peut débloquer (panier), avec une
  ligne d'explication. `disabled` reste légitime UNIQUEMENT le temps d'un
  envoi en cours (état transitoire).
- Vérifié par sabotage : remettre `disabled` fait tomber le test sur
  `opacity:0.45` — la « couleur sombre » qu'il a vue est mesurée, pas devinée.
- ⚠️ PIÈGE HARNAIS : `addInitScript` réinjectait le panier À CHAQUE navigation
  → impossible de simuler un panier vidé. Drapeau `pt_no_cart` ajouté.

## 🚦 BANDEAU DE STATUT + RÉORGANISATION DES DEUX ESPACES (28/07/2026, SW v527)
- **CLIENT** : la petite fiche « 🚦 Statut » ne reflétait que le statut BRUT.
  Or il reste `'acceptee'` jusqu'au règlement de la marchandise → elle affichait
  « accordez-vous dans la discussion » ALORS QUE les deux venaient de signer.
  Remplacée par `lvStatutBandeau(c)` : **bandeau pleine largeur** en tête de la
  grosse fiche, **vert néon « Statut : accepté »** (accord validé / commandée /
  livrée / terminée) ou **orange néon « Statut : en attente »**. C'est l'ACCORD
  qui fait foi, pas le statut seul. La fiche restante s'appelle « 🧭 Étape » et
  son texte dépend AUSSI de l'accord (plus de contradiction avec le bandeau).
- **LIVREUR** : « Mes courses » → **« 🧾 Historique de course »**, `<details>`
  REPLIÉ, **tout en bas**, ne contenant QUE les courses terminées/annulées
  (`lvFini`).
- **🟠 LE SIGNET (correctif user, 2e passe) : AUCUNE fiche ne s'ouvre toute
  seule.** J'avais d'abord fait s'auto-ouvrir la grosse fiche sur la course en
  cours (elle n'était plus dans aucune liste). L'user a tranché : « pas besoin
  qu'elle soit ouverte, il est censé y avoir le petit signet en cours, orange
  effet néon ». → `lvSignetHTML` / `lvRenderSignets` : un **signet cliquable**
  (liseré + halo orange néon, pastille « Statut : en cours ») porte la course
  tant qu'elle tourne, **hors** de l'historique replié, et c'est LUI qui ouvre
  la grosse fiche. Conteneurs `#courierEnCours` et `#clientDelivEnCours` —
  **les deux espaces se lisent pareil**. `lvFermerFiche()` à chaque rendu.
  ⚠️ Le signet vivant HORS de la liste, la délégation de clic client a dû
  passer de `listEl.querySelectorAll` à `#view-mes-livraisons …` — sinon
  bouton mort.
- La grosse fiche garde sa **pastille** à droite du titre (`margin-left:auto`
  → reste à droite même en passant à la ligne sur iPhone) : **orange « en
  cours »**, **verte « terminée »** quand on la rouvre depuis l'historique.
- ⚠️ L'historique n'est PAS un bouton mort : un clic y rouvre la fiche.
- ⚠️ PIÈGE ATTRAPÉ : mon premier correctif mettait un garde-fou dans
  `showDetail` — **il était inatteignable** (le sabotage ne le faisait jamais
  échouer) ET il aurait rendu l'historique cliquable-sans-effet. Retiré. RÈGLE
  CONFIRMÉE : **une vérification qu'on ne parvient pas à faire échouer est une
  vérification qui ne vérifie rien** — chaque contrôle de cette session a été
  prouvé faillible par réintroduction délibérée du défaut (6 sabotages).
- 🔧 **OUTIL DURCI** : `scripts/audit/p1-static.js` ne reconnaissait les
  paramètres-callbacks que sur les fonctions **anonymes** → toute fonction
  NOMMÉE recevant un callback était signalée « appel vers une fonction jamais
  définie ». Regex ajoutée pour `function nom(a, cb, c)`. Re-prouvé faillible
  (un vrai appel inexistant est toujours détecté).
- VÉRIFIÉ : **70/70 plan8.mjs** + 81/81 couriers + 32/32 bulle + 25/25 detail
  + 24/24 espace + 22/22 plan7 + 15/15 accordE2E + 16/16 a11y + 15/15 adminliv
  + 14/14 course-pay (couriers passé à 81). CI verte.
- HARNAIS PÉRIMÉS RECALÉS sur la nouvelle spec (ils encodaient des exigences
  que l'user a lui-même renversées) : `#courierMine` est désormais dans un
  `<details>` replié → `waitForSelector` doit utiliser `state:'attached'`, pas
  la visibilité ; plus AUCUN panneau ne s'ouvre tout seul ; le fil de messages
  a quitté le bloc détail (il vit dans la bulle) ; le code de remise n'est plus
  visible en permanence (panneau au clic).

## ⚖️ QUI DÉCIDE QUOI — LA CHAÎNE DE LA LIVRAISON REDRESSÉE (28/07/2026, SW v528)
User : « il y a plein de choses pas cohérentes ». Il avait raison, et la
correction touche le MODÈLE, pas l'affichage. Règle GRAVÉE, à ne plus inverser :
- **Le CLIENT pose TOUTES ses conditions À LA COMMANDE** — date, créneau,
  **point de dépôt**, **précisions** — et ne les ressaisit **JAMAIS** après.
- **Le CLIENT ne propose JAMAIS de prix.** S'il trouve trop cher, il négocie
  dans la discussion et le livreur ajuste ses tarifs dans SES paramètres.
- **Le MODE DE RÈGLEMENT appartient au LIVREUR** (nouveau champ `paiement` de
  `couriers_public`, réglé dans ⚙️ Paramètres). Le client ne le choisit pas.
- **L'ACCORD n'est plus une négociation champ par champ, il ENTÉRINE** :
  `sanitizeAccord(raw, course, paiementLivreur)` ne lit du corps QUE le prix ;
  date/heure/créneau/lieu/notes viennent de la COURSE, le règlement du PROFIL.
  → une injection `{lieu:'PIRATÉ', date:'1999-01-01'}` est ignorée (testé).
- `course-accord-propose` **refuse le client côté SERVEUR** (403
  `propose-livreur-seul`) — l'interface n'est jamais la sécurité.
### 3 INCOHÉRENCES DE FOND trouvées en retraçant la chaîne (non signalées)
1. `lieu`/`notes` **n'existaient pas sur la course** : ils ne vivaient que dans
   l'accord → ajoutés à `buildRequest` + projetés par `course-list`.
2. Le **mode de règlement du livreur n'existait nulle part** dans son profil :
   il était ressaisi à chaque accord.
3. Le **bandeau vert acceptait à l'aveugle** — un clic = engagement, sans
   jamais voir la course.
### UI
- **DUO client** (`#clientDelivEnCours`) : signet **carré à gauche**, **carte
  publique du livreur à droite**, **hauteurs égales**. ⚠️ L'égalité vient de
  DEUX mécanismes redondants (`align-items:stretch` sur la grille + `height:100%`
  pour les enfants non-items) : retirer l'un ne casse rien, retirer les deux si.
  Sans livreur → colonne « ⏳ En attente d'un livreur » (jamais de saut de mise
  en page). Carte **sans bouton « Discuter »** (grisé hors service = cul-de-sac).
- **BANDEAU VERT** : **clignote** (`.course-alert--blink`, s'arrête à la
  lecture), bouton **« Voir les détails »** qui **déplie** les conditions du
  client + son tarif de zone, puis **✅ J'accepte** / **✕ Pas pour moi**.
- 🐛 Défaut MESURÉ et corrigé : la pastille (167 px) débordait de la tuile
  (155 px) de **31 px** sur iPhone → `white-space: normal` + `max-width:100%`.
- 🐛 `.lv-accord__list li` : une valeur longue s'enroulait **au milieu de son
  intitulé** (« 📦 … × » / « Marchandise 3 ») → `flex-wrap` + bases de largeur.
### PLAFOND PERF ATTEINT — purge CSS ciblée
`scripts/ci.js` a bloqué à **60 Ko compressés** (plafond 60). ⛔ Plafond NON
relevé : purge de **16 règles réellement mortes** (0 occurrence prouvée dans
app.js/index.html/sw.js) → 59,97 Ko. ⚠️ **PIÈGE ÉVITÉ** : 65 classes semblaient
mortes, mais `abo-page--*`, `plan-detail--*`, `partner-card--*`, `stock-badge--*`,
`toast--*`, `lv-tarif--z*`, `admin-app--*`, `page-*` sont **CONSTRUITES par
concaténation** (`'toast--' + type`) et `leaflet-container` est posée par
Leaflet. Vérifier CHAQUE préfixe avant toute suppression.
- VÉRIFIÉ : **70/70 plan9** + **31/31 plan9-serveur** + 70/70 plan8 + 82/82
  couriers + 32/32 bulle + 25/25 detail + 24/24 espace + 24/24 plan7 + 15/15
  accordE2E + 16/16 a11y + 15/15 adminliv + 14/14 course-pay. CI verte.
  7 sabotages délibérés (injection du lieu par le corps, règlement repris du
  corps, formulaire de prix rendu au client, bandeau qui ne clignote plus,
  acceptation à l'aveugle, hauteurs désalignées, pastille en nowrap) : tous
  détectés.

## 🛒 ANNULER LA COURSE ≠ PERDRE SA COMMANDE (28/07/2026, SW v529)
Deux défauts signalés, une seule idée derrière : **le panier doit survivre à
l'annulation**.
### 🐛 DÉFAUT 1 — le bandeau « Règle ta marchandise » survivait à l'annulation
User : « j'ai annulé ma commande et le petit bandeau est toujours présent ; en
plus, quand je clique sur Régler, ça rouvre la commande annulée ».
- CAUSE RACINE, une ligne : `lvTodoClient` sélectionnait la course à réclamer
  **sans AUCUN filtre sur le statut**. Une course `annulee` portant un accord
  validé restait éligible, et son bouton appelait `showDetail(c)` → la fiche
  annulée se rouvrait. Le serveur, lui, était correct (`status:'annulee'`,
  `chatOpen:false`) : le défaut était 100 % côté client.
- CORRECTIF : pré-filtre `mine.filter(x => !lvFini(x))`.
- ⚠️ PIÈGE : `livree` n'est **PAS** soldée — elle attend la confirmation du
  client, c'est même l'action la plus urgente. `lvFini` = terminee|annulee
  seulement. Le harnais vérifie les 3 états vivants (à régler / à confirmer /
  accord à accepter) pour que le correctif ne tue pas le bandeau utile.
### 🐛 DÉFAUT 2 — demander depuis une FICHE PRODUIT ne mettait rien au panier
User : « il faut que ça mette obligatoirement l'article dans son panier : comme
ça, si les conditions ne lui vont pas, au lieu d'annuler la commande il annule
la course, le produit reste au panier, il n'a plus qu'à refaire une demande ».
- Sa phrase désignait un vrai trou : depuis la page Livraison la marchandise
  vient du panier, mais depuis une **fiche produit** `payload()` fabriquait la
  ligne à la volée — l'article n'était JAMAIS au panier. Annuler laissait donc
  le client les mains vides.
- `lvPoserAuPanier(lignes)` : fonction UNIQUE utilisée aux deux bouts —
  à la DEMANDE (garantir la présence) et à l'ANNULATION (rendre les articles).
- ⚠️ RÈGLE : on ne **CUMULE JAMAIS** — annuler trois fois ne doit pas donner
  six articles. On porte la quantité au **MAXIMUM** entre panier et course.
- ⚠️ `lines` ne porte que `{key, qty}` : titre/prix/image sont **relus au
  catalogue**. Une clé disparue est ignorée (jamais de ligne fantôme).
- ⚠️ La restauration n'a lieu **QUE si le serveur a accepté** l'annulation —
  sinon on rendrait des articles pour une course toujours vivante.
- Le bouton ANNONCE désormais « tes articles retournent dans ton panier ».
- VÉRIFIÉ : **32/32 plan10.mjs** (dont le cas décisif : fiche produit + panier
  vide → l'article est au panier après la demande) + 70/70 plan9 + 31/31
  plan9-serveur + 70/70 plan8 + 82/82 couriers + 149 autres. CI verte.
  **5 sabotages** : filtre de statut retiré, restauration supprimée, pose au
  panier supprimée, cumul au lieu du maximum, restauration sur échec — tous
  détectés.

## 🔔 FLUIDITÉ & VÉRITÉ DE L'AFFICHAGE (28/07/2026, SW v530)
Cinq retours, tous tracés dans le code AVANT correction.
### P1 — Le bandeau vert ne s'actualisait JAMAIS
« il ne s'affiche que sur la page du livreur, ou alors il met beaucoup de temps ».
Il était bien posé sur toutes les pages, mais chargé **UNE SEULE FOIS**, au
verdict d'authentification : une course déposée après l'ouverture n'apparaissait
jamais. → `lvAlertPlanifier()` : sondage **45 s** (~80 req/h, plafond 400
lectures/h/uid), **rien quand l'onglet est caché**, une seule minuterie.
- ⚠️ PIÈGE ANTICIPÉ : si le sondage tombe pendant que le livreur LIT les
  détails dépliés, `lvAlertMaj` les refermait sous ses yeux. Garde ajoutée :
  `if (e.det && !e.det.hidden) return;`.
### P2 — Aucun vrai livreur n'était prévenu
`alertNewCourse` n'écrivait qu'aux `TEST_EMAILS` + owner. → `destinatairesLivreurs(db)`
lit `couriers` où `kycStatus === 'valide'` (plafond 50) et alerte par email.
⚠️ Les 3 appels (`course-request`, `course-create`, webhook) passent désormais `db`.
- **SMS** : aucun fournisseur n'existait. `sendSms()` (Twilio, HTTP + Basic auth,
  zéro dépendance) est écrit mais **TOTALEMENT INERTE** sans
  `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` — prouvé : 0 appel
  réseau sans clé. `telE164` normalise (0690… → +590690…) et REFUSE tout ce qui
  n'est pas un vrai numéro. ⚠️ ACTION USER pour activer : créer un compte
  Twilio, acheter un numéro, poser les 3 variables sur Vercel.
### P3 — Le livreur ne pouvait plus toucher à son prix
Le serveur l'autorisait DÉJÀ (il ne refuse qu'un accord **validé**) — seul
l'écran ne l'offrait pas. Champ + « 💶 Mettre à jour mon prix » tant que le
client n'a pas accepté ; plus rien une fois validé.
### P4 — L'historique mentait
`'✅ Par toi'` s'affichait dès que la course était à moi : **annulée et terminée
se lisaient à l'identique**. → `lvStatutCourt` / `lvStatutClasse` (mot +
couleur). Défaut RÉEL, pas un artefact du compte de test.
### P5 — L'annuaire disparaissait de l'accueil
`loadCouriers`/`loadPartners` résolvaient `[]` **en cas d'échec réseau**, et
l'appelant masquait la section. → `_couriersDernier`/`_partnersDernier` :
dernier succès resservi. **ÉCHEC ≠ VIDE** (5e occurrence de ce motif ici).
### P6 — On ne distinguait plus qui écrit → RÉSOLU AUTREMENT (section suivante)
Le CSS était déjà juste (violet à droite / gris à gauche). Le rôle venait de
`c.mine` SEUL : sur un compte qui joue les DEUX côtés, la bulle le prenait
toujours pour le client. J'avais ajouté un sélecteur « J'écris en tant que » —
**mauvaise décision, retirée le 28/07** : voir la section suivante.
- VÉRIFIÉ : **27/27 plan11** + **17/17 plan11-serveur** + 32/32 plan10 + 70/70
  plan9 + 31/31 plan9-serveur + 70/70 plan8 + 82/82 couriers + 18/18 accordE2E
  + 129 autres. CI verte. **6 sabotages** (sondage retiré, détails refermés,
  retour du « Par toi », prix non modifiable, échec=vide, SMS sans clé) : tous
  détectés.
- ⚠️ Budget P8 atteint DEUX fois (app.js 205 Ko, styles.css 60 Ko) : plafonds
  NON relevés — commentaires condensés + 9 règles CSS mortes vérifiées
  (`toast__icon/body/close` : `toast()` n'émet que `toast toast--type`).

## 🧪 DEUXIÈME COMPTE DE TEST + FIN DU SÉLECTEUR DE RÔLE (28/07/2026, SW v531)
User : « tu as ajouté un bouton Client ou Livreur en haut, tu trouves pas ça
bizarre ? est-ce que le problème vient du fait que je m'envoie des messages à
moi-même ? ». **Oui, et il avait raison sur les deux points.**
- **IMPOSSIBILITÉ LOGIQUE, PAS DIFFICULTÉ TECHNIQUE** : une bulle distingue
  « moi » de « l'autre » par l'identité de l'expéditeur. Quand le client et le
  livreur sont le MÊME compte, les deux côtés portent le même uid — aucune
  information dans le message ne permet de trancher. Aucun code ne peut
  distinguer deux personnes qui n'en sont qu'une.
- ⛔ **MA FAUTE À NE PAS REFAIRE** : devant cette impossibilité, j'avais posé
  une **béquille de test dans le PRODUIT** (sélecteur « J'écris en tant que »).
  Un vrai client n'aurait jamais dû le voir. La bonne réponse était de
  SIGNALER la limite, pas de la contourner dans l'interface.
- **SOLUTION RETENUE (décision user)** : un DEUXIÈME compte de test.
  `contact.piratestools@gmail.com` ajouté à `TEST_EMAILS` (dépôt de demande,
  acceptation, paiement test) **et** à `PIECES_BYPASS_EMAILS` (dossier livreur
  validable sans avis d'imposition). L'user reste le CLIENT sur
  `justforwada@icloud.com`, le 2e compte joue le LIVREUR.
- Sélecteur **entièrement supprimé** (app.js + index.html + styles.css, zéro
  trace). Le calcul `c.mine ? 'client' : 'livreur'` était déjà juste pour deux
  comptes distincts — donc plus rien à corriger.
- ⚠️ `contact.piratestools@gmail.com` est aussi `OWNER_EMAIL` : ce compte
  recevra les alertes owner ET livreur. Sans gravité en test, à RETIRER de
  `TEST_EMAILS` au lancement.
- ⚠️ **PIÈGE D'ÉCRITURE** : un 2e `pirates-tools/CLAUDE.md` avait été créé par
  erreur (mauvais répertoire courant lors d'un `cat >>`). Rapatrié ici et
  supprimé — **la mémoire du projet est UN SEUL fichier, à la racine**.

## ✅ IDENTITY PLATFORM + TOTP ACTIVÉS (28/07/2026) — infrastructure ACQUISE
Décision user : **e-mail + Google Authenticator, PAS de SMS** (SMS abandonné).
### État GRAVÉ de la console (vérifié par lecture, pas supposé)
- Projet Firebase **`pirates-tools`** (n° 573379176641) — ⚠️ l'user a DEUX autres
  projets nommés « Pirates-tools » (`gen-lang-client-…`) créés par des outils
  Google : ils n'ont RIEN à voir. Le bon ID est exactement `pirates-tools`.
- **Firebase Authentication with Identity Platform : ACTIVÉ** (plan **Spark**,
  0 €). ⚠️ Sur Spark, le plafond est **3 000 utilisateurs actifs par JOUR**
  (et non 50 000/mois — ça, c'est Blaze). Décision user : « 3 000 c'est déjà
  pas mal pour un début, je passerai au pack supérieur après quelques ventes ».
- **MFA TOTP : ACTIVÉ**, SMS laissé désactivé :
  `mfa.state = ENABLED` ET `providerConfigs[0].totpProviderConfig.state = ENABLED`
  (adjacentIntervals 5 ≈ ±2 min 30 de dérive d'horloge tolérée).
### ⚠️ PIÈGES DE CETTE ACTIVATION — à ne pas réapprendre
1. **Le bouton d'upgrade Identity Platform n'est PAS dans Authentication →
   Paramètres** mais dans **Méthode de connexion → Options avancées**, dans
   l'encart bleu du bloc « MFA par SMS » : « Mettre à niveau pour activer ».
   Ne PAS confondre avec « Mettre à niveau » en bas à gauche (= plan Blaze,
   facturation) ni avec « Activer » du bandeau orange (= connexion Google).
2. **Le TOTP n'existe DANS AUCUNE interface** — ni Firebase, ni Cloud Console
   (la page Identity Platform → MFA ne propose que le SMS). Il s'active
   UNIQUEMENT par l'API REST / Admin SDK. Fait via **Cloud Shell** (icône `>_`,
   accessible depuis l'iPad) après `gcloud config set project pirates-tools`.
3. 🐛 **MA COMMANDE ÉTAIT INCOMPLÈTE au 1er essai** : j'avais posé
   `providerConfigs` sans `mfa.state`. Résultat : TOTP « ENABLED » MAIS MFA
   générale « DISABLED » — une serrure sans porte. **Il y a DEUX états à
   allumer.** Sans la vérification par LECTURE, j'aurais conclu à tort que
   c'était fait : l'user m'avait proposé de répondre « oui/non », c'est le
   fait qu'il ait recopié le bloc qui a révélé le défaut.
   → RÈGLE CONFIRMÉE : on ne se fie JAMAIS au retour d'une écriture, on relit.
4. Commande de vérification (lecture seule, n'affiche QUE le bloc mfa, aucun
   secret) — à réutiliser :
   `curl -s ".../admin/v2/projects/pirates-tools/config" -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "X-Goog-User-Project: pirates-tools" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('mfa',{}), indent=2))"`
### 🔒 SÉCURITÉ DE L'ÉCHANGE (règle rappelée à l'user, qui a eu le bon réflexe)
Ne JAMAIS lui faire coller une sortie brute de config complète : filtrer côté
commande pour n'afficher que ce qui est nécessaire. Un état/statut se partage,
une suite de caractères aléatoires (`sk_`, `AIza`, `ya29.`, `private_key`) non.
### ⏭️ RESTE À CODER (SDK Firebase 10.13.2 — TOTP disponible)
`firebase-init.js` expose déjà `EmailAuthProvider` + `reauthenticateWithCredential`
(nécessaires : Firebase exige une connexion RÉCENTE avant l'enrôlement MFA).
Manquent : `multiFactor`, `TotpMultiFactorGenerator`, `getMultiFactorResolver`.
⚠️ **RISQUE PRINCIPAL À TRAITER AVANT TOUT ENRÔLEMENT** : un défaut dans le
défi de connexion VERROUILLE l'utilisateur hors de son compte. Porte de sortie
obligatoire = suppression du 2e facteur depuis la console (Identity Platform →
Utilisateurs). À valider AVANT que l'user n'enrôle son compte admin.

## 🔐 ADRESSE E-MAIL VÉRIFIÉE EXIGÉE (28/07/2026, SW v532) — étape 1/2
Décision user : **e-mail + Google Authenticator, PAS de SMS** (« gratuit pour
50 000 comptes, ça nous laisse une marge très large »).
### Ce qui existait déjà
`sendEmailVerification` était **déjà** appelé à l'inscription, et un bandeau
`#accVerifyBanner` + un bouton de renvoi existaient. Il manquait **le blocage** :
`verifyUid` ne lisait pas `email_verified`, donc rien n'était exigé.
### Ce qui a été fait
- `verifyIdentity(req)` (api/_lib/firebase.js) renvoie `{uid, email,
  emailVerified}` depuis la revendication **signée** `email_verified` — le
  client ne peut pas la falsifier, contrairement à un champ du corps.
  `verifyUid` est conservé (rétrocompatibilité) et délègue.
- `EXIGE_EMAIL_VERIFIE = {course-request, courier-apply}` dans contact.js →
  **403 `code:'email-non-verifie'`** avec un message qui dit quoi faire.
- ⚠️ **PÉRIMÈTRE VOLONTAIREMENT ÉTROIT** : la LECTURE (`course-list`,
  `courier-status`, `conv-list`) et les actions d'une course DÉJÀ ENGAGÉE
  (`course-accord-accept`, `course-cancel`, `course-release`) ne sont PAS
  bloquées. Coincer quelqu'un au milieu d'un parcours ne protège personne.
- ⚠️ **LE PIÈGE DU JETON PÉRIMÉ** : `email_verified` n'est mis à jour dans le
  jeton qu'au renouvellement (**1 h**) ou sur `getIdToken(true)`. Sans
  traitement, l'utilisateur qui vient de cliquer le lien resterait refusé une
  heure. → `jsonAuthHeaders(force)` + `lvEmailNonVerifie()` qui recharge
  l'utilisateur, force un jeton neuf et renvoie vers Mon compte.
- VÉRIFIÉ : **20/20 plan12-serveur** (dont « la lecture n'est PAS bloquée » et
  « 401 ≠ 403 »). 2 sabotages : blocage retiré, blocage trop zélé étendu à la
  lecture — les deux détectés.
  ⚠️ PIÈGE DE HARNAIS : sans `RESEND_API_KEY`/`OWNER_EMAIL`, contact.js répond
  503 AVANT tout contrôle et les tests « pas bloqué » passaient pour la
  MAUVAISE raison (faux vert). Variables posées + assertion explicite
  `aFranchiLeControle()`.
  ⚠️ Tout harnais qui stubbe `_lib/firebase` doit désormais fournir
  `verifyIdentity` (accordE2E.mjs mis à jour).
### ⏭️ ÉTAPE 2 — TOTP (Google Authenticator) : BLOQUÉE SUR ACTION USER
Le TOTP n'existe PAS dans Firebase Auth standard : il exige **Identity
Platform** (upgrade gratuit du projet, jusqu'à 50 000 comptes actifs).
Tant que ce n'est pas activé, `multiFactor(...).enroll()` avec TOTP n'est pas
disponible dans le SDK — impossible à coder à l'aveugle.
PROCÉDURE : console Firebase → Authentication → Settings → « Upgrade to
Identity Platform », puis Authentication → Sign-in method → activer
**Multi-factor / TOTP**. Prévenir dès que c'est fait.
PRIORITÉ RAPPELÉE À L'USER : le compte **ADMIN** en a plus besoin que les
clients (un admin piraté expose les données de tous).

## 🔐 DOUBLE AUTHENTIFICATION TOTP — LIVRÉE (28/07/2026, SW v533)
Étape 2/2 de la sécurité voulue par l'user (e-mail + Google Authenticator).
### 🛟 LA PORTE DE SORTIE A ÉTÉ ÉCRITE **AVANT** L'INTERFACE
`scripts/mfa-unlock.js` retire les seconds facteurs d'un compte avec l'Admin
SDK, **depuis l'extérieur du site**. C'est le seul chemin quand tout est
verrouillé (téléphone perdu, appli effacée, défaut du défi) — et sur le compte
ADMIN, un verrouillage signifie perdre toute l'administration.
- `--check <email>` = LECTURE SEULE (constater sans risquer de modifier, et
  RELIRE après coup : on ne se fie jamais au message de succès).
- Sans `--check` : retire tous les facteurs, puis **relit** et échoue en 1 s'il
  en reste. Refuse proprement sans credentials / sans cible / avec un JSON
  invalide (les 3 cas testés).
### 📦 ARCHITECTURE : `mfa.js`, module chargé À LA DEMANDE
⚠️ **app.js était à 205 Ko / 205 (plafond P8) : impossible d'y entasser le
TOTP.** Le plafond n'a PAS été relevé — tout le code (badge, panneau, QR,
activation, retrait, défi de connexion) vit dans `mfa.js` (4,5 Ko), chargé
seulement si on ouvre le réglage ou si un défi survient. **Mesuré : 0 octet sur
l'accueil et le catalogue.** app.js ne garde que `ensureMFA` + `mfaCtx` +
`mfaInit` et la détection `auth/multi-factor-auth-required`.
Place trouvée en condensant 4 blocs de commentaires verbeux (scroll de route,
preuve A5, barème) — l'information est conservée, la redondance retirée.
### CE QUE FAIT LE CODE
- **Enrôlement** (Mon compte → 🔐) : mot de passe → secret → **QR généré
  100 % EN LOCAL** (`cryptoLocalQR`, aucun service tiers) **+ la clé TOUJOURS
  en toutes lettres** (un QR illisible ne doit jamais être un cul-de-sac) →
  code à 6 chiffres → activé. Le code prouve que l'appli est bien réglée :
  sans cette preuve on inscrirait un facteur que l'user ne peut pas produire.
- **Défi de connexion** : la connexion n'est pas ÉCHOUÉE mais SUSPENDUE — `err`
  suffit à la reprendre, le mot de passe n'est jamais redemandé. Le champ
  remplace le bouton, le curseur y est placé.
- **Retrait** possible par l'utilisateur (mot de passe redemandé).
- ⚠️ `reauthenticateWithCredential` est OBLIGATOIRE avant enroll/unenroll
  (`auth/requires-recent-login`) — imposé par Firebase, pas par confort.
- ⚠️ **Adresse vérifiée = condition GOOGLE** (« MFA requires email
  verification ») : le panneau le dit au lieu de laisser l'enrôlement échouer.
  L'étape 1/2 livrée plus tôt le même jour était donc un prérequis, pas un bonus.
- VÉRIFIÉ : **27/27 plan13.mjs** (dont « 0 chargement sur l'accueil » et « QR en
  data:image, donc local »). **4 sabotages** : enrôlement sans
  ré-authentification, clé texte retirée, blocage e-mail levé, défi supprimé —
  tous détectés. + 20/20 plan12-serveur + 27/27 plan11 + 32/32 plan10 + 70/70
  plan9 + 70/70 plan8 + 82/82 couriers + 214 autres. CI verte.
### 📱 L'USER N'A PAS DE TÉLÉPHONE — TOUT EST SUR IPAD (contrainte gravée)
Signalé le 28/07/2026 : **un appareil ne peut pas scanner son propre écran.**
La saisie manuelle de la clé n'est donc PAS un repli pour lui, c'est LE chemin.
- La **clé est présentée EN PREMIER**, le QR passe dans un `<details>` replié
  (« ou scanner depuis un autre appareil »).
- **Bouton « 📋 Copier la clé »** — sur tablette, sélectionner un texte à la
  main est pénible et un seul caractère oublié = code refusé sans explication.
  ⚠️ Repli obligatoire si le presse-papiers est refusé : on SÉLECTIONNE la clé
  (« touche Copier »). Jamais de bouton sans effet — sabotage vérifié.
- La marche à suivre est écrite : **+ → « Saisir une clé de configuration » →
  type « Basé sur le temps »**.
- 💡 Sur iPad, le **trousseau Apple fait le TOTP nativement** (Réglages →
  Mots de passe → le compte → « Configurer le code de vérification » → « Saisir
  une clé de configuration »). Il remplit même le code automatiquement à la
  connexion. À privilégier sur une app tierce dans son cas.
### ⏭️ RESTE À FAIRE (user)
Activer la 2FA sur le compte admin depuis Mon compte → 🔐, **après** avoir
vérifié son adresse e-mail. Garder `scripts/mfa-unlock.js` sous la main.

---

# 📓 SESSION DES 48 HEURES — 15 et 16/08/2026 (57 commits, 55 fichiers, +12 721 / −1 349 lignes)

> Mesuré : `git log --since="2026-08-14 20:00" --oneline | wc -l` → 57 ·
> `--numstat` agrégé → +12 721 / −1 349 · `--name-only | sort -u` → 55 fichiers.
> Cette section existe parce que l'user a dû réclamer DEUX FOIS un journal de
> bord qu'il n'avait jamais vu passer. Le défaut est à moi : je gravais dans
> les documents thématiques (`LECONS`, `DEMANDES`, `ERREURS`, `ARBITRAGE-D57`)
> et jamais dans l'histoire du projet. **Un travail non journalisé est un
> travail que personne ne peut relire.**

## 1. Ce qui a été RÉPARÉ — les défauts d'ARGENT d'abord

| # | Le défaut | Ce qu'il coûtait | La réparation | Preuve |
|---|---|---|---|---|
| A1 | 1 698 fiches annonçaient une « économie » contre un prix de référence **inventé** | Pratique commerciale trompeuse (J4, D-004) | l'économie retirée partout | `11bee15` |
| A2 | Makita : une **vente à perte APPLIQUÉE** en production, plus 2 coûts faux | marge négative, silencieuse | grammaire des suffixes Makita branchée sur l'appariement | `e13e7c3` |
| A3 | fiche `P2LRT` : référence tronquée, coût d'un autre article | 345,31 € au lieu de 470,65 € | recollage `DCG406P2LRT`, vérifié sur dewalt.fr | `86191c7`, `274b8c9` |
| A4 | fiche `d125/8` : identifiant non écrivable, jamais repricée | prix figé | id rendu écrivable, marque tranchée sur la capture de l'user | `86191c7`, `e043a80` |
| A5 | 203 hausses en attente jamais arbitrées (D-57) | prix sous-évalués en vitrine | **arbitrées une par une**, 203 verdicts au registre | `e619aca`, `docs/ARBITRAGE-D57.md` |
| A6 | les hausses différées mouraient avec l'instance serveur | 415 hausses perdues par rafale | file rendue **durable** (`config/pw_hausses_<marque>`) | `a21a7a1`, `94d1098`, `ddb01c1` |
| A7 | la vignette recopiait `images[0]` en base64 | **la moitié** du budget du document Firestore | vignette dérivée, plus stockée | `98e92bd` |

## 2. Ce qui a été RÉPARÉ — la LECTURE du fournisseur

- **« 1,4 % de tuiles perdues » était faux** : c'étaient des **doublons de
  carte** jamais comptés. Comptés → 98,56 %, puis 99,34 %, puis **100 %**
  (`1068b2e`, `1d2b738`). Chaque tuile d'un balayage est désormais lue,
  comptée **ou nommée**.
- Le balayage réel émet son **registre de pertes** (`perdus`) : les blocs
  illisibles sortent avec leurs lignes et leur motif, au lieu de disparaître
  (`6a0cb33`). Mesuré ensuite sur un vrai balayage : 96 blocs nommés, **zéro**
  référence DeWALT parmi eux.
- Le **titre de l'offre a le dernier mot** sur la fiche : 400 appariements
  relus à la main, garde `titreContreditFiche` posée (`1cde9ef`), puis étendue
  à la grammaire Makita (`e13e7c3`).
- Le parseur lit **toutes** les références d'un pack (`refsDuTitre`, D-168,
  `c15b5c0`) ; les 66 références de packs ont été **recoupées sur le web une
  par une** → 97,0 % (`3ac1d81`, D-169).
- « sans brosse » = brushless, jamais un accessoire (`d14314a`) — sans ça
  l'offre nue la moins chère devenait illisible.
- Mesure posée, pas devinée : **1 204 références vues chez le fournisseur sans
  fiche au catalogue** (`43b1ec7`, `archives/idealo/absents-du-catalogue-balayage7.csv`).

## 3. La chaîne du RATTRAPAGE — quatre marches, une seule cause

L'user a refusé **deux détours** ce jour-là, et il avait raison les deux fois
(ses mots sont dans `.claude/PROTOCOLE.md` §2.6). La cause était toujours la
même : *une fiche que la grille ne montre plus n'est jamais relue.*

1. **D-171** (`fcf95a7`) — un relevé **frais mais d'avant le calibrage** entre
   au rattrapage. Fini « on attend 14 jours ».
2. **D-172** (`e593d1f`) — le **plan normal joint le rattrapage** : le geste
   unique de l'user couvre la grille ET ce qu'elle ne montre plus. Sur panne
   Firestore le plan de grille sort quand même.
3. **D-173** (`e1a96ca`) — une reconfirmation est un **acte daté**, sinon la
   file tourne en rond (mesuré : 46 des 49 références re-cherchées étaient les
   mêmes d'un balayage à l'autre).
4. **D-174** (`1c9072e`) — la recherche se fait **par racine**, pas par
   variante : `q=DLM330` rend toutes les variantes, `q=DLM330RT` rendait une
   coquille de 935 octets.

## 4. La règle que l'user a fait graver

> « on ne règle jamais un problème isolé, tu vas à la source et tu règles ce
> putain de problème »

Gravée dans `.claude/PROTOCOLE.md` §2.6 (injectée à chaque message) et repliée
en une ligne dans `CLAUDE.md` (`00ea5ba`, `799a0a4`). L'exemple payé du jour y
figure : **deux détours proposés pour une seule fiche**.

## 5. Mes propres erreurs, nommées

- **E-115** — j'ai présenté un « 89 € » comme une offre ratée alors que c'était
  un **encart de grille**. Ses captures ont prouvé que le minimum réel de la
  famille était 114,32 €. Un chiffre lu hors de son cadre est une invention
  (`e155aac`, tour 6 de `docs/METHODE-VERIF-TRAQUEUR.md`).
- J'ai écrit que `P2LRT` était « tronqué de DCD800P2LRT » : **faux**, c'était
  `DCG406P2LRT`, vérifié sur le site du fabricant. Corrigé au registre.
- `check-separation-marques` m'a mordu **deux fois** : une variable
  intermédiaire masquait le test de marque. La règle M-28 exige le test **sur
  la ligne d'appel** — pas vingt lignes plus haut.
- Un premier jet de la garde Makita **refusait un vrai kit** du corpus. Attrapé
  par `check-parseur-releves` **avant** la production, pas après.
- Trois refus du garde-sortie pour des formulations de report (« je corrigerai
  au prochain passage ») : chaque fois remplacées par une **mesure**.

## 6. Le 16/08 au soir — le silence du rattrapage rendu audible

Le balayage de 15h51 (110 pages, **4 430 tuiles, 4 430 lues, 100 %**, empreinte
de parseur identique à celle du dépôt) n'a rien changé pour `makita-dlm330rt`.
En remontant la trace, la cause est **datée et close** :

- **15/08, parseur `779a09fe…`** : une tuile intitulée « Makita DLM330 » (sans
  suffixe, 141,08 € — le prix de la machine **nue**) a été écrite sur la fiche
  du **kit** `makita-dlm330rt`. C'est la vente à perte.
- **16/08, parseur `4d399fb2…`** (celui qui sert aujourd'hui, mesuré) : le même
  titre ne rapproche **plus rien** — vérifié en rejouant les trois appariements
  sur ce titre exact. **La cause est fermée à la source.**
- Ce qui restait : le **résidu** en base, et l'impossibilité de savoir si le
  rattrapage l'avait cherché. Les réponses de page sont **anonymes** (le
  raccourci poste le texte de la page, pas son adresse) : dans 110 réponses,
  rien ne disait ce qu'on avait cherché.

⇒ Correctif posé le 16/08 : **la mémoire du rattrapage**. Le plan retient les
racines qu'il a servies ; toute racine **redemandée** est une racine que le
balayage précédent n'a pas reconfirmée, et **deux silences d'affilée** la
déclarent `muette` — nommée dans la réponse, jamais laissée à vendre en
silence. Coût compté : **1 lecture + 1 écriture par plan** (pas par page).
Porte : `check-price-watch` — **cinq sabotages, cinq rouges**.

## 7. Où en est la marque Makita

- DeWALT : **bouclée**, 100 % des tuiles lues.
- Makita : calibrage du parseur fait (suffixes, packs, lots germaniques), trois
  défauts d'argent corrigés. Reste la **traîne** des fiches que la grille ne
  montre pas : la file de rattrapage en comptait **305 au-delà du plafond de
  67** lors du dernier essai sur base factice — elle se draine de balayage en
  balayage, et l'on saura désormais **lesquelles** ne reviennent jamais.
