# 🤝 PLAN ABONNEMENTS & PROGRAMME PARTENAIRE — 6 phases (25/07/2026)

> Document maître du chantier « abonnements réels ». Décisions user gravées.
> Règle d'exécution : 1 phase = livrée, vérifiée (Playwright + CI), commitée.
> Prix/avantages des tiers Basique/Pro/Gold = PROPOSITION à co-valider (user).
> Le tier BLACK PARTENAIRE (100 €/mois) = spec FINALE validée par l'user.

## 📌 SPEC FINALE — Black Partenaire 100 €/mois (10 places)

- **Bon d'achat : +38 €/mois** (456 €/an), crédité UNIQUEMENT au paiement de la
  mensualité (sécurité), cumulable sans limite, **reste acquis** même après
  résiliation (l'argent payé lui appartient). Mois impayé = pas de bon.
- **Pack de bienvenue ANNUEL** : ÉPI complet floqué aux couleurs de l'artisan
  (chaussures de sécurité, pantalon, t-shirt, lunettes, gants — sourcing
  Chine/Maroc ≈ 50-70 € réels flocage inclus, tailles/pointure collectées au
  formulaire de souscription) + **site vitrine one-pager** créé par nous
  (template dupliquable ≈ 2 h/site, domaine ≈ 8 €/an) — **remaster chaque
  année**. S'il a déjà un site : au choix (a) refonte du sien, (b) page
  portfolio complémentaire, (c) budget pub doublé le 1er trimestre.
- **Publicité locale gérée** : ~120 €/an de budget réel, au choix **Google Ads
  OU Facebook/Instagram** (Meta pilotable à distance via Business Suite —
  accès partenaire à configurer une fois, ~30-60 min/client ; Meta recommandé
  par défaut pour les artisans locaux).
- **Ventes privées en avant-première** (ajout 25/07 : présent sur tous les
  tiers, prioritaire pour Black).
- **Réseau d'entraide OBLIGATOIRE** : chaque semaine, chaque partenaire reçoit
  la publication d'un AUTRE partenaire d'un MÉTIER DIFFÉRENT (algorithme de
  rotation anti-concurrence : un pisciniste partage un charpentier, jamais un
  pisciniste) et doit la partager. Lui-même est partagé en retour. + 1 story
  dédiée/mois sur le compte Pirates Tools + présence dans la story hebdo
  « nos partenaires ». Publication fournie par l'artisan (upload JPEG/PNG dans
  son compte → bouton téléchargement dans l'admin → posté par nous/le président).
- **Manquements** : 3 manquements aux règles de partage → clôture du programme.
- **Impayés** : relances multiples (email + notification compte ; SMS = option
  future Twilio), échéance 15 jours ; tolérance 1 mois sur simple message
  expliquant la situation ; résiliation à 1 mois + 15 jours. (Stripe
  Subscriptions gère relances/pause nativement — Phase 3.)
- **Annuaire « Nos artisans »** : carte PREMIUM (6 photos, badge Partenaire,
  lien vers son site). Sans engagement. Acceptation des conditions par
  formulaire (horodatée en Phase 3).

## 📊 Proportionnalité proposée (à co-valider) — bons ≈ 38 % de la cotisation

| Tier | Prix/mois | Bon/mois | Bon/an | Remise* | Annuaire |
|---|---|---|---|---|---|
| Basique | 4,90 € | 1,90 € | ~23 € | — (petits avantages) | carte texte (0 photo) |
| Pro | 14,90 € | 5,70 € | ~68 € | 2 % | logo + 1 photo |
| Gold | 29,90 € | 11,40 € | ~137 € | 3 % | 3 photos + lien |
| Black Partenaire | 100 € | 38 € | 456 € | 5 % (plafond 100 €/mois) | premium 6 photos |

DÉCISION 25/07 (2e passe) : remises abaissées à 0/2/3/5 % — même non
cumulées, 8-10 % rognaient trop la marge sur ventes (~13 % du TTC). Quand le
passage en CONTAINER fera baisser les coûts, baisse de prix NON
proportionnelle prévue pour redonner de l'espace aux remises. DÉGRESSIF
STRICT : Black contient TOUT ce que les tiers inférieurs ont (container,
devis chantier — illimités pour Black), et son pack ÉPI + site web sont
débloqués IMMÉDIATEMENT au premier paiement (précisé sur la page).

*Remises NON CUMULABLES avec la remise fidélité (la plus avantageuse
s'applique) — décision 25/07 : sans ce verrou, un gros acheteur Platine
(remise 18 % cumulée) passait la marge en négatif. Multiplicateurs fidélité
(×2/×3) RETIRÉS de tous les tiers (décision user 25/07). Tous les tiers ont
les ventes privées ; Black les a en avant-première. Pages : switcher de packs
en tête pour comparer sans repasser par l'accueil.

Économie Black/an/partenaire (coûts réels user) : 1 106 € HT − bon ~330 €
(coût logistique incluse) − ÉPI ~60 € − pub 120 € − domaine 8 € − Stripe ~21 €
≈ **+560 € net** + 12 stories de visibilité croisée. ×10 places ≈ 5 600 €/an.

## PHASE 1 — L'offre publique (pages + valeurs réelles) ✅ EN COURS
1. Source de données UNIQUE `ABO_DATA` (fin du doublon PLAN_INFO/ABO_DATA).
2. 4 tiers réécrits : Black Partenaire = spec finale complète (pack bienvenue,
   bon, entraide, impayés, 10 places) ; Basique/Pro/Gold = proposition sobre
   ci-dessus (marquée à co-valider). Fin des promesses intenables (-25/-40 %,
   différé 90 j, site offert à 99 €…).
3. Orbes accueil + graphe : prix 4,90/14,90/29,90/100 et économies HONNÊTES
   calculées sur un profil affiché (artisan ~4 000 €/an d'achats).
4. Page Black : règles d'entraide expliquées + case « j'accepte les règles »
   qui ACTIVE le CTA ; CTA = WhatsApp pré-rempli si numéro configuré, sinon
   formulaire de contact (pré-lancement affiché honnêtement).
5. Vérif Playwright (4 orbes, page Black, checkbox→CTA, 0 erreur JS) + CI + SW.

## PHASE 2 — Annuaire public « Nos artisans »
1. Route `#/artisans` + section renvoi accueil. Collection Firestore
   `partners` (écriture server-only, rules default-deny inchangées).
2. 4 designs de cartes (texte → premium). Vide propre au départ.
3. Admin : onglet Partenaires (CRUD carte, métier, tier, photos compressées
   côté client ≤ 900 Ko — pas de nouveau service de stockage).
4. Endpoint lecture publique des cartes via /api/products ? NON — nouvelle
   lecture via admin ? À trancher : GET public dédié impossible (12/12
   fonctions Vercel) → lecture Firestore côté client avec rules `read: true`
   sur `partners` uniquement (données publiques par nature).

## PHASE 3 — Souscription réelle (Stripe Subscriptions)
1. Stripe Checkout mode subscription (4 prix), webhook `invoice.paid` →
   crédit du bon (38 € Black…) — réutilise la machine à états stripe_events.
2. Formulaire d'onboarding complet AVANT paiement : tailles (haut/bas/
   pointure), logo (upload), couleurs, corps de métier, page Facebook, choix
   pub Google/Meta, choix option site (neuf/refonte/portfolio/pub doublée),
   acceptation des conditions HORODATÉE (Firestore, preuve).
3. Compteur de places serveur (10 max Black) — refus propre au-delà.
4. Politique impayés Stripe : relances auto, pause (geste commercial 1 mois),
   annulation à 1 mois + 15 j. Emails Resend aux étapes clés.

## PHASE 4 — Portefeuille (bon d'achat) serveur-autoritaire
1. Solde `users/{uid}` (champ server-only via rules), historique crédits/débits.
2. Affichage dans le compte client (solde + historique + « reste acquis »).
3. Déduction AU PAIEMENT côté serveur (create-payment-intent/checkout — même
   mécanique éprouvée que la remise fidélité, infalsifiable). Plafond remise
   10 % Black appliqué serveur.
4. Compta : provision mensuelle automatique du bon + traitement du bon dépensé
   (remise sur vente, pas de fausse perte) ; tests check-accounting étendus.

## PHASE 5 — Entraide & stories (le cœur du club)
1. Upload de la publication (JPEG/PNG, compression client) dans le compte.
2. Admin : galerie des publications + bouton téléchargement + marquer « posté ».
3. Rotation hebdomadaire d'appariement MÉTIERS CROISÉS (round-robin, contrainte
   métier A ≠ métier B) — job hebdo via le cron EXISTANT (param `?job=partners`,
   pas de 13e fonction Vercel). Notification email + compte à chaque binôme.
4. Compteur de manquements (3 → clôture) + écran admin de suivi.

## PHASE 6 — Usine à sites vitrine + pub
1. Template one-pager thémable (tokens couleurs/logo/photos → 2 h par site,
   objectif dupliquer sans refactor). Checklist de production par partenaire.
2. Process pub : guide setup accès partenaire Meta Business / Google Ads,
   budget ~10 €/mois, point mensuel WhatsApp ; dépenses tracées en charges.
3. Process remaster annuel (site + ÉPI renouvelés) + rappel automatique.
4. Vitrine commerciale : « votre site pro par Pirates Tools » (upsell sites
   plus poussés — pipeline de leads via l'annuaire).

## ⚠️ Risques suivis
- Temps user (armée) : onboarding étalé (ouvrir 2-3 places d'abord), collecte
  tailles/logo AU formulaire (zéro aller-retour), président poste les stories.
- Juridique : conditions du programme (partage obligatoire, manquements,
  impayés, bon) à faire relire par l'avocat AVEC les CGV.
- SMS de relance : non couvert au lancement (email + compte) ; Twilio plus tard.
