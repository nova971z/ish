# 🛵 Service Coursier « quincaillerie à la demande » — Cadrage (NON codé)

> Document de cadrage produit + légal. **Rien n'est codé.** À dérouler quand les
> prérequis seront réunis (voir §8). ⚠️ Le volet légal ci-dessous est une
> synthèse d'orientation, PAS un avis juridique — **faire valider par un avocat
> en droit des plateformes + URSSAF + DREAL avant tout lancement.**

## 1. Concept
Une plateforme de **mise en relation** entre **artisans** (qui ont besoin de
petite quincaillerie sur chantier) et de **coursiers indépendants à deux-roues**
(scooters/motos, « petits jeunes » de Guadeloupe/Martinique/Guyane…). L'artisan
signale ce dont il a besoin (référence + quantité, via la future partie
quincaillerie) ; une alerte part aux coursiers dispo ; le premier qui accepte va
chercher le produit et le livre sur le chantier. Objectif = **solidaire** :
aider les artisans à ne pas perdre une journée (et éviter les bouchons), et
donner un revenu correct à des jeunes en deux-roues.

## 2. Décisions de l'user — GRAVÉES
- **ZÉRO bénéfice pour la plateforme.** Aucune commission. Le coursier est
  rémunéré **par l'artisan**.
- **C'est l'user qui fixe le barème** selon la distance : **minimum 20 €**
  (petit matériel / quincaillerie uniquement), **jusqu'à ~100 €** selon la
  distance parcourue. Volonté explicite : que les coursiers **y trouvent leur
  compte** (à l'opposé des livreurs Uber payés une misère).
- **AUCUNE contrainte imposée aux coursiers** : libres d'accepter ou refuser,
  libres de leurs horaires, aucune sanction. « S'ils veulent, ils s'en donnent
  les moyens ; sinon tant pis. »
- **UNE seule règle** : l'artisan **précise QUAND** il a besoin de la livraison
  (dans la journée / l'après-midi / à une heure précise) en **commandant à
  l'avance**, pour laisser au coursier le temps de s'organiser et d'arriver à
  l'heure voulue.
- Livraison de **petit matériel uniquement** (quincaillerie), pas de gros/lourd.

## 3. Cadre légal & risques (synthèse — à valider avocat)
- **🔴 Requalification en salariat (risque n°1)** : jurisprudence Uber (Cass.
  2020) + **directive UE « travail de plateforme » 2024** (présomption de
  salariat, transposition France ~2026). → Les choix de l'user (zéro profit,
  zéro contrainte, liberté totale d'accepter/refuser) sont la **meilleure
  parade**. ⚠️ Le SEUL point de contrôle qui subsiste = **le barème imposé** :
  le présenter comme un **barème solidaire transparent librement accepté**, sans
  aucun autre élément de subordination.
- **🔴 Transport de marchandises pour compte d'autrui** : avec un véhicule
  **motorisé** (scooter/moto), activité réglementée → inscription registre
  transporteurs (DREAL) + attestation de **capacité de transport léger de
  marchandises**. Le **vélo** en est exempté, **pas** le scooter/moto. Point à
  clarifier absolument.
- **🔴 Assurance** : l'assurance deux-roues **personnelle NE couvre PAS** le
  transport pour autrui. Exiger **RC pro + assurance marchandises transportées**.
- **🟠 Paiement** : voir §5.
- **🟠 RGPD** : géolocalisation temps réel des coursiers = donnée sensible →
  consentement, minimisation, conservation courte, mention politique de
  confidentialité (CNIL stricte).
- **🟠 Obligations plateforme** : statut « opérateur de plateforme » +
  **déclaration des revenus des coursiers au fisc (DAC7)** dans les deux
  schémas de paiement. CGU/CGV spécifiques rédigées par avocat.
- **🟡 Coursiers** : **≥ 18 ans**, **permis valide** (AM/A1/A2/B selon
  cylindrée), statut **auto-entrepreneur** actif. Vérif KYC à l'inscription.

## 4. Tarification
- Barème **distance → prix**, plancher **20 €**, plafond **~100 €**.
- Le prix est **fixé/affiché** avant que le coursier accepte (transparence =
  protection). Le coursier accepte en connaissance de cause.
- Petit matériel uniquement (garde-fou poids/volume à définir).

## 5. Paiement — 2 options (reco : Stripe Connect 0 %)
1. **Direct** (plateforme ne touche jamais l'argent) : artisan paie le coursier
   directement. Le plus simple légalement, mais **aucune traçabilité ni
   garantie** de paiement, barème non « tenu ».
2. **✅ Stripe Connect, commission 0 %** : l'artisan paie sur le site, le
   coursier est **payé automatiquement**, tout est tracé, la plateforme **ne
   prend rien**, et **Stripe porte l'agrément** (pas besoin d'être établissement
   de paiement). → Plus pro, « mâche le travail », respecte le « zéro
   bénéfice ». **Reco.** (DAC7 : déclaration fisc des revenus coursiers dans les
   deux cas.)

## 6. « Mâcher les démarches » — assistant d'inscription coursier
Wizard pas-à-pas dans le compte **Coursier** :
1. Créer son statut **auto-entrepreneur** → lien officiel + guide.
2. **S'assurer** (RC pro + marchandises) → partenaire assureur / liste d'options.
3. **Licence transport** si scooter/moto → bon formulaire DREAL expliqué.
4. **Téléverser** les justificatifs : SIRET, attestation assurance, permis,
   carte grise.
5. Le site **vérifie** (KYC) → « il te manque X » → **activation** quand complet.

La plateforme **guide et vérifie** ; l'obligation légale reste celle du coursier
(on ne peut pas être auto-entrepreneur à sa place). But = simple et rapide.

## 7. Architecture technique (le jour venu)
- **Compte « Coursier »** (nouveau rôle) + onboarding/KYC ci-dessus.
- **Carte** : Leaflet + OpenStreetMap (gratuit, RGPD-friendly) ; position temps
  réel via API Géolocalisation navigateur + **Firestore temps réel** (déjà en
  place).
- **Flux d'une course** :
  1. Artisan compose sa liste (produits quincaillerie + qté + réf) + adresse
     chantier + **créneau souhaité** (journée / après-midi / heure précise) →
     crée une **course**.
  2. **Notification push** (Web Push / FCM) aux coursiers dispo à proximité.
  3. **Premier qui accepte = attribué** (verrou atomique Firestore — même
     technique que l'idempotence webhook Stripe déjà codée).
  4. États : `en attente → acceptée → récupérée → en livraison → livrée`, suivi
     live sur la carte pour l'artisan.
  5. **Itinéraire deux-roues basé DISTANCE (sans trafic)** — OSRM (open-source)
     ou Mapbox.
  6. **Paiement** : Stripe Connect 0 % (§5).

## 8. Prérequis AVANT de lancer ce module
1. **Entreprise créée** + **Stripe activé** (l'user attend ça — décision déjà
   prise pour tout ce qui touche au paiement).
2. **Partie quincaillerie** existante (l'artisan doit commander de vrais
   produits référencés).
3. **Avis d'un avocat** sur : structure indépendants (anti-requalification) +
   licence transport deux-roues + CGU/CGV + RGPD géoloc.
4. **Partenaire assurance** identifié pour les coursiers.

## 9. Ordre logique recommandé
entreprise → Stripe → partie quincaillerie → **PUIS** ce module coursier.
