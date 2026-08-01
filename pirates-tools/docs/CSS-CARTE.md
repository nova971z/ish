# CARTE DU CSS — tous les commentaires retirés de `styles.css`

> ⛔ **Ce fichier n'est JAMAIS servi.** Il existe parce que les commentaires
> de `styles.css` coûtaient **20 758 octets gzip** à chaque visite — et
> l'user navigue en privé, donc aucun cache ne les amortit : ils étaient
> retéléchargés à chaque fois, par lui et par ses clients.
>
> Rien n'a été perdu : chaque commentaire est ici, rattaché au **sélecteur**
> qu'il documentait — jamais à un numéro de ligne, qui se périme.
>
> Régénéré par `node outils/purge-css.mjs`.

---

### `:root`

=========================================================
Pirates Tools — styles.css (HARMONISÉ v8 - FINAL)
• Correction animation et espacement du logo
• Suppression du logo de fond global
=========================================================

ÉCHELLE Z-INDEX (référence — valeurs EFFECTIVES ; les règles de la section 45,
ex-styles inline, l'emportent sur les valeurs de base qu'elles surchargent)
Couches, du plus bas au plus haut :
-1 .......... hero masqué (hero-out) — passe derrière le contenu
0–2 ......... halo hero, conteneur logo, fonds de section
10–11 ....... #hero (fond) puis #heroLogo (logo au-dessus du halo)
15–25 ....... éléments flottants intra-contenu (flèches carrousel, etc.)
100–130 ..... petites UI flottantes (badges)
999 ......... #dock (barre d'action flottante — §45)
1000 ........ .topbar / .backdrop (voile drawer : base 998 surchargée à 1000
par §45)
1001 ........ .drawer (menu latéral — §45 ; base 999 surchargée)
1002 ........ #menu-toggle (toujours cliquable au-dessus du drawer)
9000 ........ .pay-modal (paiement)
9500 ........ .terr-menu (sélecteur de territoire) / overlays plein écran
9600 ........ .consent-bar (bandeau cookies)
9700 ........ .wa-float (bouton WhatsApp)
10000 ....... #toasts (base 9500 surchargée par §45), .pt-loadbar,
.skip-link (feedback tout en haut)
Règle : ne pas introduire de valeur « magique » hors de ces paliers ; réutiliser
le palier de la couche concernée.
=========================================================

### `:root`

========== 01) THÈME & VARIABLES GLOBALES ==========

### `(fin de fichier)`

Couleurs

### `(fin de fichier)`

Accent violet — la famille dominante du site (C7). Changer l'accent global
= éditer ces 5 valeurs (avant : ~300 littéraux éparpillés). --accent-rgb
alimente les rgba(var(--accent-rgb), α). NOTE : les textures canvas
(BRAND_COLORS, app.js) et les emails serveur (webhook.js, HTML autonome
hors CSS du site) gardent leurs littéraux — un canvas et un email ne
résolvent pas les custom properties du DOM.

### `(fin de fichier)`

UI

### `(fin de fichier)`

Layout dynamiques (pilotés par JS)

### `@supports (height: clamp(18vh,26vh,32vh))`

Réduction de l'espacement excessif

### `@supports (height: clamp(18vh,26vh,32vh))`

Dock & safe areas

### `@supports (height: clamp(18vh,26vh,32vh))`

Hero États + transitions

### `@supports (height: clamp(18vh,26vh,32vh))`

Upgrade si clamp() dispo (vieux WebKit safe)

### `*`

========== 02) RESET, BASE & TYPO ==========

### `img, svg, video`

Couche de masquage du hero après scroll — désactivée

### `h1, h2, h3`

Titres

### `.catalogue-header`

Catalogue header

### `.topbar, #topbar`

========== 03) TOPBAR ==========

### `.topbar-logo-link`

LOGO TOPBAR

### `body.page-catalogue .topbar-logo-link, body.page-devis .topbar-logo-link, body.page-compte .topbar-logo-link, body.page-`

FORCER la visibilité du logo sur toutes les pages

### `.btn`

========== 04) BOUTONS - COULEURS FORCÉES ==========

### `.btn.btn-ig`

Bleu Facebook assombri d'un cran : #1877F2 ne donnait que 4.23:1 sous du
blanc, #1773E9 donne 4.50:1 (WCAG 1.4.3 AA). Ecart percu DeltaE2000 = 1,77
— invisible a l'oeil nu. MEME valeur ici et au pied de page : un seul bleu
Facebook sur tout le site.

### `.backdrop`

========== 05) MENU LATÉRAL ==========

### `#hero, .hero-full`

========== 06) HÉRO ==========

### `#hero::before, .hero-full::before`

Halo doré derrière le logo hero (accueil uniquement).
Ancré au CONTENEUR du logo (.hero-logo-container), pas au viewport : il suit
donc exactement le logo et disparaît avec le hero (les règles display:none sur
.hero-logo-container hors accueil / au scroll l'emportent avec lui).
Localisé (cercle ~logo, pas plein écran) → lit comme une lueur, pas un fond.
Voir .hero-logo-container::before plus bas.

### `#hero::after, .hero-full::after`

Smooth transition from hero to content

### `.hero-logo-container::before`

Lueur dorée localisée, pile derrière le logo. Positionnée au centre du
conteneur avec la même correction verticale que le flex-centrage (le
padding-top décale le logo vers le bas de safe-top/2) → reste centrée sur le
logo à toutes tailles. z-index 0 < #heroLogo (11) → toujours derrière.

### `body:not(.page-home) #hero, body:not(.page-home) #heroLogo, body:not(.page-home) .hero-logo-container`

Masquer le hero sur toutes les pages sauf accueil

### `#view-home .container`

========== 07) ACCUEIL — ESPACEMENT ==========

### `.toolbar`

========== 08) TOOLBAR & CHAMPS ==========

### `.list`

========== 09) LISTES & CARTES AVEC EFFET NÉON VIOLET ==========

### `.pager`

Pagination catalogue : boutons de page (DOM borné à PAGE_SIZE cartes).

### `.product-card`

── Product Cards ──

### `(fin de fichier)`

Bas-gauche (était haut-gauche) : sur cartes étroites, un tag long
(BEST-SELLER, ULTRA-COMPACT) en haut chevauchait "EN STOCK" (haut-droite).
En bas-gauche, EN STOCK reste seul en haut ; le plafond de largeur + ellipsis
garantit qu'il ne rejoint jamais le cœur favori (bas-droite).

### `.product-card--sm`

Small variant for related products

### `.related-grid`

Related products grid

### `.no-results`

No results state

### `.cat-chip`

── Category chips ──

### `.card`

CARTES AVEC EFFET NÉON VIOLET

### `.card:hover`

content-visibility:auto retiré (même bug de peinture skip iOS que .view).

### `body.page-devis #view-devis`

========== 10) PAGE DEVIS ==========

### `.devis-stats`

── Stats Banner ──

### `.devis-list`

── Cart Items List ──

### `.devis-item`

── Single Cart Item ──

### `.devis-item__img-wrap`

── Item Image ──

### `.devis-item__body`

── Item Body ──

### `.devis-item__bottom`

── Item Bottom Row ──

### `.devis-item__qty-wrap`

wrap : sur mobile étroit, sous-total + boutons Payer/Supprimer débordaient
SUR le stepper quantité (subtotal nowrap + margin-left:auto) et avalaient
les taps +/− — détecté par hit-test audit. Avec wrap, la ligne se replie
proprement ; aucun effet desktop (l'espace suffit).

### `.devis-item__qty-wrap`

── Qty Stepper ──

### `.devis-item__subtotal`

── Subtotal ──

### `.devis-remove`

── Remove Button ──

### `.devis-empty`

── Empty State ──

### `.devis-footer`

── Sticky Footer ──

### `.devis-btn`

── Devis Buttons ──

### `.home-products-strip`

========== 10b) BANDEAU SCROLL PRODUITS (accueil) ==========

### `.product-card--more`

Carte « Voir tout le catalogue » en fin de bandeau (vitrine bornée à
HOME_STRIP_MAX cartes — le reste vit dans le catalogue paginé).

### `.plans-section`

========== 10c) ABONNEMENTS & SERVICES ==========

### `.plan-orbs`

── Round Orbs ──

### `.plan-orb__pulse`

Pulse ring animation (hidden by default)

### `.plan-orb--basique .plan-orb__circle`

── Basique — Cool Teal ──

### `.plan-orb--pro .plan-orb__circle`

── Pro — Electric Blue ──

### `.plan-orb--gold .plan-orb__circle`

── Gold — Luxe Amber ──

### `.plan-orb--black .plan-orb__circle`

── Black Metal — Dark Premium ──

### `.plan-orb.is-active .plan-orb__name`

Common active states

### `.plan-orb__tag`

Tags

### `.plans-chart`

── Chart — Modern Glassmorphism ──

### `.plan-detail`

── Detail panel ──

### `.plan-detail--basique .plan-detail__inner`

Tier-specific detail colors

### `.plan-detail__cta`

CTA button in detail panel

### `.abo-page`

══════════════════════════════════════════════════════════════
ABONNEMENT PAGE — 4 themes distincts
══════════════════════════════════════════════════════════════

### `.abo-hero`

── Hero header ──

### `.abo-features`

── Features list ──

### `.abo-cta-wrap`

── CTA bottom ──

### `.abo-page--basique`

════════════════════════════════════════════════════════════
THEME: BASIQUE — Teal / Minimalist Clean
════════════════════════════════════════════════════════════

### `.abo-page--pro`

════════════════════════════════════════════════════════════
THEME: PRO — Electric Blue / Corporate Tech
════════════════════════════════════════════════════════════

### `.abo-page--gold`

════════════════════════════════════════════════════════════
THEME: GOLD — Luxe Amber / Warm Premium
════════════════════════════════════════════════════════════

### `.abo-page--black`

════════════════════════════════════════════════════════════
THEME: BLACK METAL — Dark Iridescent / Ultra Premium
════════════════════════════════════════════════════════════

### `.home-reviews`

========== 10b) AVIS CLIENTS — ACCUEIL ==========

### `.tools-banner`

========== 11) BANNIÈRE OUTILS 3D ==========

### `.tools-3d-viewer`

--- 3D Viewer Carousel ---

### `.tools-3d-label`

Label overlay

### `.tools-3d-counter`

Counter (e.g. 3 / 12)

### `.tools-3d-arrow`

Arrow buttons

### `.tools-3d-dots`

Dots navigation

### `.tools-banner`

Add bottom margin for dots

### `.cat-list`

========== 13) CATALOGUE ==========

### `@media (max-width: 640px)`

Mobile : RANGÉE UNIQUE défilante (pattern e-commerce standard). En wrap,
les 8 chips s'empilaient sur 4 rangées jusqu'au bas de l'écran — la
dernière tombait sous le bandeau cookies qui avalait les taps (bug
« les boutons catégorie ne marchent pas »).

### `.pdp-nav`

========== 14) PDP — LANDING INTERACTIVE (Apple-style) ==========

### `.pdp-nav`

Navigation retour

### `.pdp-hero`

── HERO : model-viewer plein ecran ──

### `.pdp-hero::after`

Hauteur = fenêtre MOINS le padding-top de #app (calc(--safe-top + 10px),
§46). Le héros vit sous la topbar : à 100dvh son bas débordait de 80px
sous l'écran → bloc info (ancré en bas) et bandeau « Économisez » coupés,
et le produit centré trop bas. Même formule que #app = jamais désynchro.

### `.pdp-hero::after`

Glow ambiant derriere le model 3D

### `#pdp3d`

Conteneur du poster héros (cible de la parallaxe au scroll)

### `@keyframes pdpModelAppear`

rogne la partie remontée hors cadre

### `.pdp-hero__img`

Poster produit : taille d'origine, LÉGÈREMENT remontée pour dégager le titre
tout en gardant une marge sous la topbar (le bas vide est rogné par le
conteneur en overflow:hidden). -12% = compromis vérifié : marge topbar
conservée ET produit au-dessus du titre. Vaut aussi pour les futurs PNG.

### `.pdp-hero__gradient`

Gradient en bas du hero

### `.pdp-hero__info`

Info en bas du hero (titre + prix)

### `(fin de fichier)`

titre sur toute la largeur de l'écran…

### `@keyframes pdpInfoAppear`

Le bloc info est ancré au BAS du héros (align-items:flex-end). Avec un
padding-bas de 40px, le contenu le plus bas (le switch Solo/Coffret) tombait
SOUS le dock fixe (hauteur 64px + safe-area) → clics avalés par le dock, zone
cliquable réduite au haut du bouton. On dégage tout le bloc AU-DESSUS du dock.

### `.pdp-hero__price`

Lettres réduites (produit gardé à sa taille d'origine) : le titre plus
petit dégage le produit et se resserre en bas. Le clamp reste fluide en
largeur (téléphone → desktop) ; le titre prend toute la largeur (info en
width:100% + padding latéral = marge de sécurité, jamais collé aux bords).

### `.pdp-variant`

── Switch de variante Solo / Coffret (héros fiche produit) ─────────────────
Deux segments côte à côte : chacun porte son libellé (« Sans coffret » /
« Avec coffret ») ET son prix → sert de bouton ET d'écriteau. Le segment actif
est mis en avant (accent). Le gros prix au-dessus reflète la sélection.

### `.pdp-hero__badges`

Badges en haut à droite du héros (stock + tag), comme sur les cartes.
Libère le centre : le titre descend, le poster remonte.

### `.pdp-hero__flag`

dans le flux du conteneur, pas en absolu (cartes)

### `.pdp-hero__scroll-hint`

Poster/produit remonté au MAXIMUM vers le haut du héros (juste sous la topbar),
pour dégager le produit du titre et laisser la place en bas au titre + prix +
bandeau vert. S'applique au poster comme aux futurs PNG.

### `.pdp-hero__scroll-hint`

Scroll hint

### `.pdp-hero__scroll-hint.hidden-hint`

purement décoratif → ne jamais capturer un clic

### `@keyframes pdpFadeUp`

── KEYFRAMES ──

### `@keyframes pdpGlowLine`

pdpGlowPulse SUPPRIMÉ (25/07) : remplacé par le halo statique du viewer
(voir .pdp-section.visible .pdp-split__viewer) — l'animation box-shadow
repeignait en continu. goldShimmer/blackTextShine/blackRing conservés :
surfaces minuscules, coût de repaint négligeable (décision documentée).

### `.pdp-section + .pdp-section::before`

── GLOW DIVIDERS between sections ──

### `.pdp-section`

── SECTIONS — base (JS handles transforms via scroll) ──

### `.pdp-section.visible`

Visible state for IntersectionObserver (stagger children)

### `.pdp-section[data-animate="scale-up"]`

Scale-up variant (discover, CTA) — JS drives the heading, CSS for the container

### `.pdp-section[data-animate="parallax"]`

Parallax variant (media)

### `.pdp-section[data-animate="stagger"]`

Stagger variant (features, kit)

### `.pdp-section[data-animate="fade-up"].visible`

Fade-up variant

### `.pdp-section__inner`

── SECTION INNER ──

### `.pdp-section--discover`

── DISCOVER SECTION ──

### `.pdp-section--split`

── SPLIT SECTION : 3D + SPECS ──

### `#pdp3dSecondary`

Halo STATIQUE (intensité moyenne de l'ancien pdpGlowPulse). L'animation
box-shadow 20→100px de blur repeignait en continu le plus grand bloc de
la fiche (coût iPad réel). Un pseudo-élément compositor est impossible :
overflow:hidden clippe ::before/::after, et toucher au conteneur 3D est
invérifiable en sandbox (leçon v318). Halo conservé, repaint supprimé.

### `.pdp-split--solo`

Produit sans caractéristiques : le bloc specs est masqué (JS) et la 3D se
recentre en colonne unique au lieu de laisser une moitié droite vide.

### `.pdp-specs-table`

── SPECS TABLE ──

### `.pdp-section--media`

── PHOTO PRODUIT ──

### `.pdp-section--features`

── FEATURES — grille ──

### `.pdp-section--kit`

── KIT ──

### `.pdp-section--cta`

── CTA ──

### `.pdp-landing__actions .btn--lg`

PDP CTA buttons — override .btn base styles for product page theme

### `.pdp-landing__actions .btn--lg.primary`

Primary — violet gradient

### `.pdp-landing__actions .btn--lg.btn-wa`

WhatsApp — green

### `.pdp-landing__actions .btn--lg:not(.primary):not(.btn-wa)`

Share — outline style

### `.pdp-reviews`

── AVIS CLIENTS ──

### `.pdp-reviews__summary`

Résumé note moyenne

### `.pdp-reviews__list`

Liste des avis

### `.pdp-reviews__form-wrapper`

Formulaire

### `@media (max-width: 768px)`

── RESPONSIVE PDP ──

### `.pdp`

Legacy fallbacks

### `.meter`

========== 15) (legacy devis cleared) ==========

### `.meter`

========== 16) JAUGE FIDÉLITÉ ==========

### `.tabs`

========== 17) COMPTE — onglets & sections ==========

### `.auth-card`

========== 18) AUTH ==========

### `.auth-tabs`

── Auth Tabs ──

### `.auth-card__body`

── Auth Form ──

### `.auth-submit`

── Auth Submit Button ──

### `.auth-submit__spinner`

Loading state on auth submit buttons

### `.auth-forgot-row`

Forgot password row + link

### `.auth-forgot-panel`

Forgot password panel (slides in over login form)

### `.acc-verify-banner`

Email verification banner on the account page

### `.chip`

========== 20) CHIPS ==========

### `#dock, .dock`

========== 23) DOCK ==========

### `.dock__badge:empty, .dock__badge[data-count="0"]`

WCAG 1.4.3 AA : le chiffre fait 11 px, il lui faut 4.5:1. Le rouge iOS
#ff3b30 ne donnait que 3.55:1 sous du blanc. #df342a = 4.50:1.

### `.view`

========== 24) VUES / ROUTER ==========

### `#view-produit`

content-visibility:auto RETIRÉ (bug page vide iOS Safari) : sur iPad, une vue
dont le sous-arbre est remplacé (re-render #list au clic d'une catégorie) ou
révélée via bascule display restait « skipped » → seul le placeholder
contain-intrinsic-size (≈800×600) était peint = zone noire, topbar/dock fixes
visibles, mais AUCUN contenu de vue (ni barre de recherche, ni chips). Gain
perf nul ici (SPA = une seule vue affichée, les autres sont display:none).

### `#view-produit`

Vue produit : pleine largeur, pas de content-visibility (casse sticky)

### `#toasts`

========== 25) TOASTS ==========

### `.sr-only, #sr-live`

========== 26) A11Y ==========

### `.skip-link:focus`

-80px : entièrement hors écran, ombre comprise (à -42px le bas de la boîte
+ box-shadow dépassait en haut de page — liseré blanc visible).

### `#updateBanner`

========== 27) BANNIÈRES ==========

### `@media (prefers-reduced-motion: reduce)`

CSS mort retiré (item 12) : #a2hsTip / #a2hsTriangle / .a2hs-tip__* +
@keyframes a2hs-in (astuce « Ajouter à l'écran d'accueil ») et #netBanner
(bannière hors-ligne). Aucun de ces id/classes n'est référencé dans le HTML,
app.js, sw.js ni les autres scripts servis — vérifié à 0 référence.

### `@media (prefers-reduced-motion: reduce)`

========== 28) ANIMATIONS ==========

### `.brands-section`

========== 29) MARQUES — Showcase Premium ==========

### `.brands-section`

── Section wrapper ──

### `.brands-showcase`

── Grid ──

### `.brand-card`

── Single Brand Card ──

### `.brand-card__ring`

── Rotating ring ──

### `.brand-card__bubble`

── Bubble (inner circle) ──

### `.brand-card__logo`

── Logo ──

### `.brand-card__name`

── Label ──

### `.brand-card:hover .brand-card__ring, .brand-card:focus-visible .brand-card__ring`

── Hover States ──

### `.brand-card:active .brand-card__ring`

── Active / Press ──

### `@media (max-width: 420px)`

── Responsive ──

### `@media (max-width: 768px)`

========== 30) RESPONSIF GÉNÉRIQUE ==========

### `.tools-3d-arrow`

Responsive 3D carousel

### `.devis-item__name`

Responsive devis - mobile

### `.tools-3d-arrow`

Responsive 3D carousel

### `.site-footer`

========== 31) FOOTER ==========

### `.footer-social`

Footer — Social banner

### `.footer-social__link--ig`

voir .btn.btn-fb : 4.50:1 avec le libelle blanc

### `#list, #contact, #pdp, #view-catalogue, #view-devis, #view-compte`

========== 32) PATCHES & ANCRAGES ==========

### `#list, #contact, #pdp, #view-catalogue, #view-devis, #view-compte`

(overrides #a2hsTip/#a2hsTriangle retirés — CSS mort, voir item 12 plus haut)

### `.acc-hero`

============================================================
ACCOUNT — Refonte (hero + onglets)
============================================================

### `.acc-tabs`

Tabs

### `.acc-card-next`

Écart entre deux cartes empilées dans un onglet du compte. Remplace sept
`style="margin-top:1.2rem"` écrits en dur : une valeur dans un attribut
`style=` ne suit aucun jeton de la charte, et il fallait la corriger sept
fois pour la changer une.

### `.acc-id`

Carte d'identité du compte — LECTURE SEULE (onglet Profil).
Disposition HORIZONTALE : les champs se rangent en colonnes tant que la
largeur le permet (auto-fit), et retombent en une colonne sur téléphone.
Le libellé est au-dessus de la valeur, en capitales fines : c'est la forme
retenue par les espaces clients qui affichent une identité sans la rendre
modifiable sur place. Ici RIEN n'est saisissable — on modifie dans
Paramètres.

### `.acc-id__f`

`.specs` est un `display:flex` : sans cette base à 100 %, la grille se
réduit à la largeur de son contenu et `auto-fit` ne donne qu'UNE colonne —
donc pas de disposition horizontale du tout.

### `.acc-id__f dd.is-empty`

Un email long ne doit pas élargir la grille au point de faire défiler
la page horizontalement.

### `.acc-orders`

Commandes — aperçu (Profil) et liste complète (onglet Commandes)

### `.acc-order__st`

L'état se lit à la forme autant qu'au mot : une pastille colorée distingue
« Payée » d'un « Paiement en cours » sans avoir à lire.

### `.acc-danger`

Danger card

### `.pay-modal`

============================================================
PAYMENT MODAL — Stripe checkout
============================================================

### `.pay-modal__powered strong`

Rangée : logo du fournisseur puis mention. `inline-flex` et non `flex`,
pour que l'ensemble reste centré par le `text-align: center` du pied.

### `.pay-modal__provider-logo`

Le logo est fourni avec sa tuile et ses angles déjà arrondis : on ne
redécoupe rien ici. `flex: 0 0 auto` l'empêche d'être compressé quand la
mention passe sur deux lignes en 390 px.

### `.pay-tabs`

── Onglets de paiement ───────────────────────────────────────

### `.cryptopay`

── Portail crypto (étapes numérotées) ────────────────────────

### `.cryptostep`

Encadré d'étape

### `.cryptopay__nets`

Grille de réseaux

### `.cryptopay__detail`

Détail (QR + adresse + montant)

### `.devis-buy`

Devis "Payer" button per line

### `.merci-card`

Merci page

### `.product-card__model`

3D model on product cards

### `.brand-card__bubble`

3D brand spheres

### `[data-reveal]`

============================================================
SECTION REVEAL — Entrance/exit animations on home page
============================================================

### `[data-reveal-stagger] > *`

Stagger reveal — children pop in one by one

### `.brands-showcase .brand-card`

Brand bubbles entrance — disable initial auto-anim, replay on reveal

### `@media (prefers-reduced-motion: reduce)`

========== ACCESSIBILITÉ : reduced-motion global ==========

### `@media (hover: none)`

========== TOUCH : neutraliser les hover sticky ==========
Sur iPad / mobile, un :hover reste collé après un tap jusqu'au
prochain tap ailleurs, provoquant des transforms/scale persistants.
On retire les transforms de hover pour les éléments interactifs
principaux — les :active/focus gèrent le feedback tactile.

### `.stock-badge`

========== STOCK BADGES ==========
Shown on product cards (top-right of image) and inline on PDP price block.
Statuses : in_stock (green), low_stock (orange), out_of_stock (red), preorder (blue).

### `.product-card--out .product-card__img-wrap img, .product-card--out .product-card__img-wrap model-viewer`

Out-of-stock card : dim the image so users feel the unavailability

### `.pdp-price .stock-badge, #pdpPrice .stock-badge`

Inline badge in PDP price block — not absolute, flows with text

### `#pdpQuote[disabled], #pdpBuy[disabled], #pdpQuote[aria-disabled="true"], #pdpBuy[aria-disabled="true"]`

Disabled buy/quote buttons when stock_status = out_of_stock

### `#view-admin`

========== ADMIN PANEL (#/admin) ==========

### `.admin-login`

Admin login gate

### `.admin-tabs`

Admin : tabs

### `.admin-tabs::-webkit-scrollbar`

Trop d'onglets pour la largeur (mobile/iPad) → défilement horizontal au
lieu d'un débordement hors-zone (« Instagram » coupé). Swipe sur tactile.

### `.admin-tabs::-webkit-scrollbar`

Firefox : barre masquée (on swipe)

### `.admin-tab`

WebKit/iOS : barre masquée

### `.admin-tab:hover`

jamais rétréci → libellé entier, pas coupé

### `.admin-stats-actions`

── Dashboard analytics (Statistiques + Clients) ─────────────────────

### `.compta-cards`

── Comptabilité & Veille (admin) — pensé lisible/simple (dyspraxie) ───────

### `.compta-kpis`

Synthèse comptable

### `.brand-goal`

Objectif partenariat marque (ex. DeWALT 10 000 €) — barre de progression

### `.mg-controls`

Onglet Marges (admin) — tableau des marges nettes live

### `.mg-est`

Marqueur « coût estimé » (pas encore relevé par le traqueur) dans Marges.

### `.fisc-card`

Fiscalité — cartes déclarations

### `@media print`

Impression → PDF (iPad : Partager → Enregistrer dans Fichiers en PDF)

### `#ptInvoice, #ptInvoice *`

Conserver les aplats jaune/anthracite + le filigrane à l'impression PDF.

### `.wishlist-btn`

========== WISHLIST (heart button on cards) ==========

### `(fin de fichier)`

Bas-droite : coin dédié au cœur favori (le tag promo occupe le haut-gauche).

### `.wishlist-header`

Wishlist view

### `#view-contact`

========== CONTACT FORM (/contact) ==========

### `.home-newsletter`

========== NEWSLETTER (home) ==========

### `.home-products-strip--recent`

Recently viewed strip uses same layout as home-products-strip

### `@media (prefers-reduced-motion: reduce)`

========================================================================
GLOBAL A11Y : reduced-motion + hover guards
-------------------------------------------
Last-word rules so respect for user preferences wins everywhere.
========================================================================

### `@media (hover: none)`

Protect translate/scale hover effects from sticky touch-highlights on
devices without a real hover. Disables the "lift" only (no functionality
lost). Targets high-traffic interactive cards.

### `.terr-wrap`

========== 33) TERRITORY SELECTOR (DOM-TOM) ==========

### `.pt-badges`

========== 35) PRODUCT DOM-TOM BADGES ==========

### `.pt-badge`

Bas-gauche de l'image : coin dédié aux badges DOM-TOM. Le tag promo est en
haut-gauche, EN STOCK en haut-droite, le cœur favori en bas-droite → 4 zones
distinctes, aucune superposition possible.

### `.pt-badges--pdp`

Flow variant on PDP discover section — show label text

### `.terr-view`

========== 36) TERRITORY LANDING VIEW ==========

### `.faq-list`

FAQ list (used on territory view and anywhere .faq-list appears)

### `.consent-bar`

========== 37) CONSENT BAR ==========

### `.consent-bar`

BUG corrigé : remonté de 96px (dock) + texte long empilé sur ~8 lignes,
le bandeau formait un pavé ~350px qui recouvrait les filtres du catalogue
et AVALAIT les taps (fixed, z 9700) tant que l'utilisateur n'avait pas
répondu — soit à chaque session en navigation privée. Version compacte :
typo réduite + garde-fou max-height à défilement interne. Le bandeau ne
peut plus manger que ~le quart bas de l'écran.

### `.consent-bar__inner`

Tout en bas (8px), PAS remonté au-dessus du dock : la remontée de 96px
plaçait le pavé pile sur les filtres du catalogue (viewport ~664px).
Le bandeau peut recouvrir le dock TEMPORAIREMENT (z 9700 > dock 999) —
on lui répond une fois et il disparaît ; le contenu de la page, lui,
doit rester tapable en permanence.

### `.consent-bar__inner`

Pile verticale : texte pleine largeur (2 lignes) puis boutons — sinon les
boutons écrasaient le texte en colonne étroite de ~8 lignes.

### `.wa-float`

========== 38) WHATSAPP FLOTTANT ==========

### `.wa-float.wa-float--hidden`

Le vert WhatsApp reste EXACTEMENT le vert de marque. C'est le texte qui
passe en foncé : blanc sur #25D366 ne donnait que 1.98:1, très loin des
4.5:1 exigés. #042016 donne 8.66:1 — et c'est déjà ce que fait le bouton
WhatsApp du pied de page (.footer-social__link--wa).

### `.devis-loyalty`

========== 39) DEVIS FIDÉLITÉ ==========

### `.devis-shipping`

========== 40) DEVIS LIVRAISON ==========

### `.pt-local-compare`

========== 41) COMPARATEUR PRIX LOCAL ==========

### `.pay-address`

========== 42) STRIPE ELEMENTS ==========

### `.pay-address`

Adresse de livraison (avant le formulaire carte). Style aligné sur
l'apparence Stripe Elements (fond #1a2332, focus violet) pour une
continuité visuelle dans la modale.

### `.pay-card-same`

Champ carte Revolut : l'INTÉRIEUR est une iframe qui lui appartient (la
carte ne touche jamais notre domaine). On habille le conteneur pour qu'il
ressemble aux autres champs — sinon il fait « site étranger » au moment de
payer.
⛔ On vise les classes que Revolut pose LUI-MÊME (`rc-card-field*`), et on
ne lui passe RIEN : lui envoyer un objet `classes` partiel a cassé le
chargement du champ le 01/08/2026. Styliser de l'extérieur ne peut pas
casser ce qu'on ne touche pas.

### `.pay-card-same`

Nom du titulaire : meme habillage que les champs d'adresse, pour que le bloc
carte forme un tout coherent.

### `.rc-card-field--focused`

⛔ Le contenu collait EN HAUT du cadre : `padding: 12px` fixe ne centre
rien quand la hauteur du cadre dépasse celle de la ligne. On centre pour
de vrai — le champ se place au milieu quelle que soit la hauteur.

### `.pay-modal__pay`

⛔ Le bouton « Commander » restait LUMINEUX alors que le clic ne pouvait
rien faire — CGV non cochées, ou champ carte pas monté. Un bouton qui a
l'air actif et ne répond pas, c'est un client qui clique, ne comprend pas,
et s'en va. On éteint le dégradé et le halo, et le curseur le dit aussi.
Sélecteur ciblé sur CE bouton : aucun effet de bord ailleurs.

### `.pay-card-label`

pas de transparence : on veut « éteint », pas « fantôme »

### `.stripe-payment-element`

⛔ 120 px etait calibre pour STRIPE ELEMENTS, qui empilait plusieurs champs.
Le champ Revolut tient sur UNE ligne : il restait 74 px de vide sous lui, et
le bloc « Carte bancaire » avait l'air cassé. 56 px = de quoi loger la ligne
du champ OU l'indicateur de chargement, sans trou.

### `.ig-admin`

========== 43) INSTAGRAM ADMIN ==========

### `.ig-account-card`

Account card

### `.ig-token-card`

Token

### `.ig-media-grid`

Media grid

### `.ig-publish-form`

Publish form

### `.ig-comments-lookup`

Comments

### `.ig-insights-grid`

Insights

### `@media (max-width: 600px)`

Responsive

### `.legal-page`

========== 44) PAGES LÉGALES (mentions + confidentialité) ==========

### `.footer-legal`

Liens légaux dans le footer

### `.legal-form`

Encadré formulaire type de rétractation (CGV)

### `:root`

========== 45) EX-STYLES INLINE (index.html) — fusion C4 ==========
Déplacés VERBATIM depuis les <style id="pt-fix|hero-scroll-animation|pt-ui">
du <head>. Ils étaient chargés APRÈS styles.css : placés en FIN de fichier,
la cascade est équivalente par construction (mêmes règles, même ordre,
toujours après tout le reste). Dédoublonnage volontairement NON fait ici
(fusion sans risque d'abord, simplification éventuelle ensuite).

### `:root`

── ex <style id="pt-fix"> ──

### `.hero-logo-container`

brand styles now in styles.css

### `.hero-logo-container`

── ex <style id="hero-scroll-animation"> ──

### `.hero-full.hero-out`

── ex <style id="pt-ui"> ──

### `.chips`

brand grid styles now in styles.css

### `.pt-loadbar`

── Top loading bar ─────────────────────────────────

### `.drawer`

Drawer (menu lateral)

### `#side-menu.open, .menu-open #side-menu`

Force menu states

### `.abo-rules`

── Abonnements remaster (25/07) : règles du programme + acceptation ───────
(Phase 1 du plan docs/PLAN-ABONNEMENTS.md)

### `.abo-switch`

Switcher de packs en tête de page abonnement (comparaison directe).

### `.artisans-header`

========== 46) ANNUAIRE ARTISANS (Phase 2 abonnements) ==========
Vitrine des partenaires : page #/artisans (grille, 4 designs par tier
dégressifs) + bandeau accueil réservé aux Black (même mécanique de scroll
horizontal que « Nos produits »). Photos = data-URLs compressées (admin).

### `.partner-card`

── Cartes (dégressif par tier) ──

### `.partner-card--pro`

Tier Pro : liseré accent discret.

### `.partner-card--gold`

Tier Gold : liseré doré.

### `.partner-card--black`

Tier Black : carte premium (badge, halo violet, fond dégradé).

### `.partner-strip-card`

── Bandeau accueil « Nos artisans partenaires » (Black uniquement) ──

### `.admin-partner-photos`

── Admin : galerie photos du formulaire partenaire ──

### `.admin-index-warn`

WCAG 1.4.3 AA : #ef4444 ne donnait que 3.76:1 sous le ✕ blanc.

### `.admin-index-warn`

Avertissement index Firestore manquant (admin Commandes) — lien 1-tap.

### `.rejoindre-header`

========== 47) PRÉ-INSCRIPTION PARTENAIRE (Phase 3a) ==========

### `.admin-app`

Admin — cartes de candidatures (pré-inscriptions artisans, Phase 3a).

### `.admin-courier-fiche`

Carte d'un LIVREUR ACTIF dans l'administration : sa photo et son identité,
telles que les clients les voient. Un dossier validé n'est plus une
candidature à traiter — il doit se présenter comme une fiche.

### `.pj-back`

Bouton retour du formulaire de pré-inscription.

### `.img-busy`

Chip d'attente pendant la compression d'une image (logo/photos).

### `.pdp-batt-note`

Note « vendu sans batterie ni chargeur » sur la fiche (machine seule).

### `.lv-cta-card .lv-cta-txt`

═══ §47 — DEVENIR LIVREUR (service coursier, formulaire adaptatif) ═══════════

### `.courier-space > * + *, #courierWork > * + *, #courierParams > * + *, #courierMyCard > * + *, #clientDelivList > * + *, `

── RYTHME VERTICAL DES ESPACES LIVRAISON ──────────────────────────────────
🐛 DÉFAUT SIGNALÉ (user 27/07/2026) : « la plupart des widgets se collent,
ils se touchent tous, même avec la carte au-dessus ». Cause : .lv-card n'a
AUCUNE marge — deux cartes consécutives se retrouvaient bord à bord, et
l'écran devenait illisible.
On pose l'espacement sur le CONTENEUR (règle « lobotomised owl » : entre
deux frères, jamais avant le premier ni après le dernier). Aucun risque de
double marge avec les grilles, qui gèrent leur propre `gap`.

### `#courierMine > .lv-h3 + *, #clientDelivList > .lv-h3 + *`

Les titres de sous-section respirent au-dessus, pas en dessous.

### `.lv-chat, .lv-panel, .lv-proof, .lv-rate`

Le panneau de l'accord et le fil de discussion ne doivent jamais toucher
la carte de course qui les précède.

### `.lv-vehicles`

Flex + wrap + centré : la 3e carte (Scooter/Moto) se centre seule sur sa
ligne au lieu de rester bloquée dans la colonne gauche d'une grille.

### `.lv-insurers`

Boutons assureurs (encadré assurance moto — mâche le travail)

### `.lv-progress`

Mon dossier livreur : progression + pièces à déposer

### `.lv-cost__grp`

Bloc coût estimé (démarches livreur)

### `.admin-app__actions`

Actions admin dossier livreur

### `.lv-piece__actions`

Boutons démarche / formulaire par pièce (dossier livreur)

### `.lv-cost__headline`

Bandeau budget + délai (en tête du bloc coût livreur)

### `.lv-banner--green`

Livreur : bandeau vert, cartes centrées, bouton rémunération, coordonnées, consentement

### `.isl-grid`

═══ §48 — SÉLECTEUR D'ÎLE (inscription) : contours DORÉS lumineux ══════════

### `.lv-banner`

Bandeau livreur : îles dorées + bouton fermer

### `.lv-remun-isle`

Panneau tarifs livreur : l'île du client (grand contour doré, futur support des zones)

### `.lv-remun-isle svg`

Île maximisée : pleine largeur du panneau, hauteur plafonnée (le panneau ne
grossit pas) ; le viewBox est recadré au contenu par le JS. Trait FIN façon
globe (vector-effect : reste fin quel que soit le zoom du viewBox).

### `.lv-conso`

Détail consommation cylindrée (livreur)

### `.lv-bareme`

Barème livreur : liste des zones (panneau public)

### `.admin-bareme__zones`

Admin : barème & carburant

### `#view-livraison .container`

Page Livraison quincaillerie + bulle accueil

### `.pdp-deliv-map`

Fiche quincaillerie : bloc livraison chantier

### `#lvDynamic`

Espacement des blocs dynamiques du formulaire livreur (fix blocs collés)

### `.pdp-deliv-map .leaflet-container`

Leaflet dans notre thème sombre

### `.pdp-deliv-map.leaflet-container`

Leaflet est LA racine du conteneur (L.map(mapEl)) : neutralise le centrage grid

### `.lv-course`

Cartes de course (espace livreur, mode test)

### `.pdp-deliv-fields`

Formulaire livraison : COLONNE UNIQUE (fix radios qui empiétaient sur la date)

### `.courier-space`

═══ §49 — MODE LIVRAISON (espace livreur) ═══════════════════════════════════

### `.lv-rate`

Notation du livreur (environnement client)

### `.qty-step`

═══ §50 — PAIEMENT COURSE + QUANTITÉ + PREUVE PHOTO ════════════════════════

### `.qty-step`

Sélecteur de quantité (fiches quincaillerie) : pilule moderne, gros taps

### `.pay-modal__line--deliv .pay-modal__line-title`

Ligne livraison dans la modale de paiement

### `.lv-proof`

Preuve de livraison (photo) — espace livreur + espace client

### `.lv-handcode`

Code de remise (espace client) : gros chiffres dorés + QR local

### `.mfa-cle`

Clé TOTP 32 car. — pourquoi pas .lv-handcode__num : voir mfa.js

### `.lv-code-input`

Saisie du code côté livreur

### `.lv-proof__grid`

Grille des photos de preuve (client : remise + chantier + sa photo)

### `.lv-vid`

Vidéo de remise + litige (protection mutuelle client/livreur)

### `.reprice-health`

Santé des coûts d'achat (admin → recalcul des prix)

### `.lv-course--todo`

Livraison qui attend une action du client (à confirmer)

### `.lv-earn`

Widget « Mes gains » (espace livreur)

### `.pay-modal__cgv`

Acceptation des CGV avant paiement (art. L221-14 C. conso)

### `.lv-tarifs__map`

═══ §51 — LIVREURS : TARIFS PAR ZONE, FICHES PUBLIQUES, CHAT ═══════════════
Le livreur fixe LUI-MÊME ses prix (garde-fou juridique : la plateforme
n'impose aucun montant et ne trie jamais sur le prix — voir
docs/METHODE-ENTREPRISE-FISCALITE.md § 5 bis). Ces styles couvrent :
la grande carte des zones éditable, les cartes livreurs (accueil + annuaire
+ fiche publique) et le fil de discussion client ↔ livreur.

### `.lv-tarifs__map`

— Grande carte des zones : pleine largeur, format généreux (iPad/mobile) —

### `.lv-tarifs__map svg path`

⚠️ RÈGLE INDISPENSABLE — sans elle, l'île est NOIRE et masque les anneaux.
Les tracés de l'île sont CLONÉS depuis #regIslands ; en changeant de parent
ils perdent « .isl svg path { fill:none } » et retombent sur le fill par
défaut du SVG, c'est-à-dire NOIR OPAQUE. Comme ils sont peints APRÈS les
anneaux, ils recouvrent toute la carte. Même trait doré que .lv-remun-isle.
Les anneaux, eux, portent leur couleur en style INLINE : ils gagnent sur
cette règle et ne sont donc pas effacés.

### `.lv-dispo`

— Interrupteur « je suis disponible » —

### `.couriers-grid`

— Cartes livreurs (grille annuaire + bandeau accueil) —

### `.courier-prof__head`

— Fiche publique du livreur —

### `.courier-card__cta`

Discussion directe : le fil occupe toute la largeur (pas de colonne de
boutons comme dans le chat d'une course — il n'y a ni accord ni paiement
ici, c'est une simple mise en relation).

### `.courier-card__cta`

Bouton « Discuter » : sur la carte comme sur la fiche. Hors service il
reste VISIBLE mais éteint et non cliquable — le faire disparaître laisserait
croire que la fonction n'existe pas.

### `.btn[disabled], .btn:disabled`

Regle generale : un bouton desactive ne doit JAMAIS avoir l'air cliquable
(defaut vecu le 28/07/2026 sur « Payer ma marchandise »).

### `.lv-header--tools`

En-tête de l'espace livreur : titre à gauche, ⚙️ Paramètres à DROITE et
parfaitement visible (demande user 27/07/2026).

### `.lv-header--tools`

⚠️ Le bouton doit rester EN HAUT À DROITE, y compris quand le texte est
long. Avec flex-wrap seul il passait à la ligne et se retrouvait À GAUCHE
(mesuré x=126 au lieu de ~720) — « margin-left:auto » le colle à droite
dans TOUS les cas, enroulé ou non. Le bloc de texte peut rétrécir
(min-width:0), sinon il pousse le bouton hors de l'en-tête.

### `.lv-gear--plain`

Variante neutre : même gabarit, sans la couleur d'accent (action secondaire
comme « Rafraîchir » — elle ne doit pas rivaliser avec l'action principale).

### `.lv-todo`

── BANDEAU « À FAIRE MAINTENANT » (modèle Uber) ───────────────────────────
Une seule chose à l'écran doit crier. S'il y a une action attendue de moi,
elle est ICI, en haut, avec son bouton — et rien d'autre ne lui ressemble.

### `.courier-mycard`

La carte du livreur telle que les clients la voient, dans son espace.

### `.chat-bubble`

══ BULLE DE DISCUSSION (façon Messenger) ════════════════════════════════
En bas à GAUCHE — le dock des raccourcis est centré, le bouton WhatsApp est
à droite : les trois ne se croisent jamais. z-index 9600 : au-dessus du dock
(1001) et des overlays (9500), en dessous du WhatsApp (9700) et des
messages système (10000).

### `(fin de fichier)`

--consent-h : hauteur RÉELLE du bandeau cookies, publiée par app.js. Sans
ce décalage, le bandeau recouvre la bulle et avale les clics — piège déjà
vécu le 15/07/2026 avec les chips du catalogue. 0 le reste du temps.

### `.chat-bubble__n`

Pastille du nombre de discussions.

### `.chat-win`

La FENÊTRE : petite, ancrée au-dessus de la bulle, comme Messenger.

### `.chat-item`

Une entrée de la liste des discussions.

### `@media (max-width: 480px)`

Sur petit écran, la fenêtre prend presque tout l'espace.

### `.lv-vid__sum`

Actions secondaires d'une course (vidéo, litige) : repliées par défaut.
Elles ne servent qu'en cas de problème et ne doivent pas encombrer l'écran.

### `.lv-service`

── BANDEAU « EN SERVICE » + POINT LUMINEUX ────────────────────────────────
L'état se lit d'un coup d'œil, sans avoir à lire : le bandeau ET le point
s'allument ensemble ou s'éteignent ensemble. Le vert est celui du reste du
site (#34d399) ; hors service, tout retombe en gris neutre — pas en rouge,
qui signalerait un problème alors que le livreur a simplement fini sa
journée.

### `.lv-service.is-on`

ALLUMÉ : le bandeau se teinte, le point s'illumine et respire.

### `.lv-service.is-off .lv-service__dot`

ÉTEINT : aucune animation, aucune lueur.

### `@media (prefers-reduced-motion: reduce)`

Respect du réglage système « réduire les animations ».

### `.courier-card__dispo`

La pastille de la CARTE reprend exactement le même point.

### `.lv-chat`

— Fil de discussion client ↔ livreur —

### `.lv-msg`

🐛 Les bulles se touchaient : .lv-msg n'avait aucune marge, les messages
se collaient les uns aux autres et le fil devenait illisible. On respire
entre chaque, un peu plus quand l'interlocuteur change (regroupement visuel
des messages consécutifs d'une même personne, comme dans les messageries).

### `.btn--danger`

— Demande de course : sortie de secours (remise en ligne) et annulation —

### `.lv-chat__body`

— Chat en 2 colonnes : fil à gauche, colonne d'actions à droite —

### `.lv-chat__body`

Le fil ayant quitté ce bloc (28/07/2026), il n'y a plus de colonne
principale à côté : les actions occupent toute la largeur, sur UNE RANGÉE.

### `(fin de fichier)`

── FICHES D'INFORMATION : une info = une fiche, côte à côte ──────────────
Remplace cinq lignes de texte brut empilées (demande user 28/07/2026).
Elles s'enroulent d'elles-mêmes ; sur téléphone, deux par rangée.

### `.course-alert`

Annulation d'une demande : action grave et rare — centrée, seule sur sa
ligne, pour qu'on ne la touche jamais par accident (demande user 28/07).

### `.course-alert`

── BANDEAU « NOUVELLE COURSE » ────────────────────────────────────────────
Sous la barre du haut, pleine largeur, vert. Il glisse depuis le haut, on
touche pour accepter, la croix l'écarte. z-index 9550 : au-dessus du contenu
et de la barre haute, en dessous de la bulle (9600) et des messages (10000).

### `@keyframes course-alert-blink`

CLIGNOTEMENT (user 28/07/2026) : tant qu'une course attend, le bandeau
respire — c'est ce qui le fait remarquer quand on ne regarde pas l'écran.
Il s'ARRÊTE dès que les détails sont dépliés : le clignotement appelle
l'attention, il ne doit pas gêner la lecture.

### `.course-alert__det`

Détails du client, dépliés au clic.

### `#courierMine .lv-h3, #courierEnCours .lv-h3`

── « MES COURSES » — présentation haut de gamme ──────────────────────────
Une course = une carte avec un liseré d'état à gauche, une ligne de titre
forte (zone + prix), et ses détails en dessous. Fini la liste plate.

### `.lv-histo`

Historique replié : le résumé se lit comme un titre de carte, avec un
chevron qui dit clairement que ça s'ouvre.

### `.lv-statut`

── BANDEAU DE STATUT (pleine largeur de la grosse fiche) ─────────────────
Demande user 28/07/2026 : le statut doit se lire d'un coup d'œil, en néon.
VERT = c'est acté · ORANGE = ça attend quelqu'un. Il traverse toute la
fiche, juste sous le titre — impossible de le manquer.

### `.mfa-challenge`

Défi TOTP à la connexion : révélé seulement si Firebase le réclame.

### `.lv-st--wait`

Pastilles de STATUT sur les cartes de course. Avant, toute course « à moi »
affichait « ✅ Par toi » : une annulée et une terminée se lisaient pareil.
La couleur porte l'information autant que le mot (défaut vécu 28/07/2026).

### `.lv-signet`

── SIGNET « en cours » ───────────────────────────────────────────────────
Le petit marqueur orange néon qui porte la course tant qu'elle tourne
(user 28/07/2026). Il est CLIQUABLE — c'est lui qui ouvre la grosse fiche,
qui ne s'affiche donc plus d'elle-même. Liseré orange à gauche pour qu'on
le repère sans lire.

### `.lv-duo`

── DUO : signet « en cours » à GAUCHE, carte du livreur à DROITE ─────────
Demande user 28/07/2026 : « mets-le en carré rangé sur la gauche et à ses
côtés la carte du livreur, ils doivent avoir exactement la même hauteur ».
La hauteur identique vient de `align-items: stretch` + `height: 100%` sur
les enfants : elle reste vraie quel que soit le contenu, sans valeur figée.
DEUX colonnes EXACTEMENT (`1fr 1fr`), pas `auto-fit` : celui-ci déclarait
autant de pistes que la largeur en permettait (4 sur desktop, dont 2 vides
et collapsées). Le rendu était juste, mais la règle ne disait pas ce qu'on
voulait — et une règle qui se trouve juste par accident finit par se tromper.
Sous 360 px seulement, on empile : deux colonnes y deviendraient illisibles.

### `.lv-duo > *`

Deux mécanismes REDONDANTS, et c'est voulu : `align-items: stretch` égalise
les items de la grille, `height: 100%` propage la hauteur aux enfants
(.courier-card, .lv-duo__wait) qui, eux, ne sont pas des items de grille.
Retirer l'un seul ne casse rien ; retirer les deux casse l'alignement — le
harnais le prouve (plan9.mjs, sabotage F3).

### `.lv-duo .lv-signet`

Le signet passe en TUILE (colonne) : c'est le « carré » demandé.

### `.lv-duo .lv-signet .lv-pill`

Dans la tuile (≈155 px sur iPhone), la pastille en `nowrap` débordait de
31 px mesurés. Elle doit pouvoir se replier et ne jamais dépasser son bloc.

### `.lv-dhead`

En-tête de la grosse fiche livreur : titre à gauche, PASTILLE à droite.

### `.lv-pill`

`margin-left:auto` : la pastille reste collée À DROITE même quand elle passe
à la ligne sous le titre sur un écran étroit (iPhone) — sinon elle se
recollait à gauche et ne se lisait plus comme un état.

### `.lv-fact__k`

Le titre est SÉPARÉ de la valeur par un trait lumineux, pas par du vide.

### `.lv-accord__list li`

Intitulé à gauche, valeur à droite. Sur écran étroit, une valeur longue
(« 2 articles de quincaillerie × 3 ») s'enroulait AU MILIEU de l'intitulé :
on lisait « 📦 … × » puis « Marchandise 3 ». `flex-wrap` + bases de largeur
font passer la valeur À LA LIGNE ENTIÈRE plutôt que de couper l'intitulé.

### `.product-grid`

═══ §52 — CORRECTIFS AUDIT P1 (intégrité statique) ═════════════════════════
`.product-grid` était utilisée sur #terrViewProducts (pages territoire
#/guadeloupe, #/martinique, #/guyane, #/reunion, #/mayotte) SANS AUCUNE
règle : les 8 produits mis en avant s'empilaient en pleine largeur au lieu
de former une grille. Alignée sur `.list` (la grille du catalogue) pour que
les cartes soient rigoureusement identiques d'une page à l'autre.

### `.btn--ghost`

`.btn--ghost` : variante SECONDAIRE, utilisée 29 fois (28 boutons d'admin +
« Voir les formules ») mais JAMAIS définie — tous ces boutons secondaires
étaient donc rendus comme l'action principale (dégradé bleu plein, ombre
portée), ce qui écrasait la hiérarchie visuelle. Défaut trouvé à l'audit P1,
même famille que `.btn--primary` (étape C1).
