# 🛵 PLAN DE CRÉATION — Service Coursier « quincaillerie à la demande »

> **Doc maître de construction.** On construit TOUTE l'architecture maintenant,
> mais **INACTIVE** : un interrupteur global `COURIER_ENABLED = false` empêche
> toute inscription/course réelle tant qu'on n'ouvre pas (même principe que
> `PT_CRYPTO_ENABLED`). Concept & décisions user = `PLAN-SERVICE-COURSIER.md`.
>
> ⚠️ **Ceci n'est PAS un avis juridique.** C'est une synthèse d'orientation
> bâtie sur les sources officielles (liens en §B). **Tout sera relu par un
> avocat en droit des plateformes avant activation** (§C = check-list avocat).

---

# PARTIE A — PLAN DE CONSTRUCTION (phases)

Chaque phase indique l'exigence légale qu'elle sert (renvoi §B).

### Phase 0 — Fondations INACTIVES
- Interrupteur global `COURIER_ENABLED = false` (app.js), miroir serveur.
- Nouveau rôle de compte `courier` (à côté de client/artisan).
- Collections Firestore créées mais **fermées par les règles** (server-only) :
  `couriers`, `courier_applications`, `courses`, `courier_locations`.
- Aucune entrée dans le menu public tant que le flag est false.

### Phase 1 — Modèle de données (Firestore)
- `couriers/{uid}` : profil coursier, statut KYC (`pending|verified|rejected`),
  véhicule (vélo/scooter/moto + cylindrée), zone.
- `courier_applications/{uid}` : pièces téléversées (SIRET, assurance, permis,
  carte grise, capacité transport léger si motorisé) — server-only.
- `courses/{id}` : demande artisan (produits+réf+qté, adresse chantier,
  créneau souhaité, prix barème), état
  `en_attente|acceptee|recuperee|en_livraison|livree|annulee`, uid coursier.
- `courier_locations/{uid}` : position temps réel, **TTL court (≤ 2 mois, purge
  auto)** → exigence CNIL §B-5.
- Règles Firestore : default-deny, écriture serveur, lecture minimale.

### Phase 2 — Onboarding coursier « on mâche les démarches » (§B-1, B-2)
Assistant pas-à-pas dans le compte Coursier :
1. **Créer sa micro-entreprise** → lien guichet unique INPI + guide.
2. **S'inscrire au registre des transporteurs (DREAL)** si véhicule motorisé
   (⚠️ voir §B-1 le point capacité transport léger).
3. **Assurance** (RC circulation pro + RC pro + marchandises transportées) →
   partenaire assureur / liste (§B-4).
4. **Permis** adapté à la cylindrée (§B-8).
5. **Téléverser** les justificatifs → statut de vérif → activation manuelle admin.
- Obligation plateforme d'**informer le coursier de ses obligations fiscales/
  sociales** (§B-6) intégrée dans le wizard.

### Phase 3 — Barème tarifaire (serveur autoritaire)
- Calcul **distance → prix**, plancher **20 €**, plafond **~100 €** (décision
  user). Moteur PUR côté serveur (comme `pricing.js`), jamais falsifiable client.
- Présenté comme **barème solidaire librement accepté** (§B-3, anti-subordination).
- **Commission plateforme = 0 %** (décision user : zéro bénéfice).

### Phase 4 — Création de course (artisan)
- Dépend de la **future partie quincaillerie** (l'artisan compose une liste de
  vrais produits référencés).
- Adresse chantier + **créneau souhaité** (journée / après-midi / heure précise,
  commande à l'avance) = la SEULE règle imposée (décision user).

### Phase 5 — Matching + notifications
- **Web Push / Firebase Cloud Messaging** vers coursiers dispo à proximité.
- **Premier qui accepte = attribué** : verrou atomique Firestore (même technique
  que l'idempotence webhook Stripe déjà codée dans le projet).
- Aucune obligation d'accepter (liberté = anti-requalification §B-3).

### Phase 6 — Carte temps réel
- **Leaflet + OpenStreetMap** (gratuit, RGPD-friendly ; pas Google Maps payant).
- Position coursier via API Géolocalisation navigateur (consentement §B-5).
- Itinéraire **profil deux-roues, basé DISTANCE (sans trafic)** — **OSRM**
  (open-source) — conforme à la demande user (2-roues = pas de bouchons).
- Suivi live de la course pour l'artisan.

### Phase 7 — Paiement (Stripe Connect, 0 %)
- **Stripe Connect** = statut d'**agent/mandataire de Stripe** → évite l'agrément
  d'établissement de paiement propre (§B-7). Comptes connectés = coursiers.
- L'artisan paie sur le site → reversement automatique au coursier → **0 %** pour
  la plateforme.
- KYC Stripe des coursiers (comptes connectés).

### Phase 8 — Conformité (textes + déclarations)
- **CGU du service coursier** (rédigées/relues avocat).
- **Politique RGPD géolocalisation** (finalité, conservation ≤2 mois,
  désactivation hors service) §B-5.
- **Déclaration DAC7** annuelle des revenus coursiers à la DGFiP + récap annuel
  fourni à chaque coursier §B-6.
- Mentions **opérateur de plateforme** (loyauté/transparence) §B-9.

### Phase 9 — Activation
- Bascule `COURIER_ENABLED = true` UNIQUEMENT après :
  entreprise créée → Stripe activé → partie quincaillerie → **feu vert avocat**.

---

# PARTIE B — ANNEXE JURIDIQUE COMPLÈTE (sources officielles)

### B-1. Transport léger de marchandises pour compte d'autrui 🔴 POINT CAPITAL
Transporter des marchandises **pour autrui** avec un **véhicule motorisé** (≤3,5 t,
**scooter/moto/tricycle inclus**) = **transport public routier de marchandises**,
activité **réglementée** (Code des transports). L'entreprise doit :
- avoir un **gestionnaire de transport** titulaire de l'**attestation de capacité
  professionnelle en transport léger** — **formation 105 h + examen écrit (QCM
  ~4 h) à la DREAL**, attestation délivrée par le Préfet ;
- être **inscrite au Registre national des transporteurs** (DREAL / préfet de
  région) ;
- remplir capacité financière (réduite en léger) + honorabilité.

🟢 **EXEMPTION VÉLO** : le **vélo (y compris VAE / vélo-cargo)** est **exempté** —
**aucune** capacité, **aucune** inscription registre.

⚠️ **CONSÉQUENCE STRATÉGIQUE (à trancher avec l'avocat AVANT tout)** : la vision
« petits jeunes en scooter/moto » implique, pour chaque coursier, la **capacité
transport léger (105 h)** = **barrière lourde**. Deux voies :
- **Voie simple** : coursiers en **vélo / VAE / vélo-cargo** → aucune licence.
- **Voie scooter/moto** : assumer la capacité transport léger par coursier.
C'est LA question n°1 pour l'avocat car elle conditionne toute la faisabilité.
Sources : [DREAL Grand Est — attestation capacité transport léger](https://www.grand-est.developpement-durable.gouv.fr/l-attestation-de-capacite-en-transport-leger-de-a21356.html) ·
[Ministère Transition écologique — accès profession transporteur](https://www.ecologie.gouv.fr/politiques-publiques/acces-exercice-profession-transporteur-marchandises)

### B-2. Statut micro-entrepreneur (coursier)
- Immatriculation via **guichet unique INPI** + **inscription registre des
  transporteurs (DREAL)** si véhicule motorisé (B-1).
- **Cotisations sociales** transport de marchandises (BIC) ≈ **21,2 % du CA**.
- **Seuils micro (prestations de services / BIC)** : plafond CA **77 700 €** ;
  **franchise TVA services 37 500 €** (millésimes 2025 — à reconfirmer).
- Obligations : factures conformes, **livre des recettes**, déclaration du CA à
  l'URSSAF (mensuelle/trimestrielle). Sortie du régime si dépassement 2 ans.
Sources : [Autoentrepreneur.urssaf.fr — l'essentiel du statut](https://www.autoentrepreneur.urssaf.fr/portail/accueil/sinformer-sur-le-statut/lessentiel-du-statut.html) ·
[Portail auto-entrepreneur — devenir transporteur](https://www.portail-autoentrepreneur.fr/academie/fiches-metiers/transport-logistique/devenir-transporteur)

### B-3. Travail de plateforme & requalification en salariat 🔴
- **Jurisprudence** : Cass. soc. 2018 (Take Eat Easy), 2020 (Uber) = coursiers
  requalifiés salariés en présence d'un **lien de subordination**.
- **Directive (UE) 2024/2831 du 23 oct. 2024** sur le travail via plateforme :
  **présomption légale d'emploi** (art. 5) déclenchée « lorsque des faits
  témoignant d'un **contrôle et d'une direction** sont constatés » ; encadre
  aussi la **gestion algorithmique**. **France : transposition sous 2 ans
  (~2026)**, pilotage **ARPE**.
- **PARADE (déjà dans les décisions user)** : zéro subordination — liberté totale
  d'accepter/refuser, pas d'horaires imposés, **aucune sanction**, pas de
  contrôle de l'exécution ; le barème = **prix librement accepté**, pas un ordre.
Sources : [EUROGIP — Focus Directive (UE) 2024/2831 (PDF)](https://eurogip.fr/wp-content/uploads/2024/11/Focus-EUROGIP_Travail-de-plateforme-Comprendre-la-DirectiveUE2024-2831.pdf) ·
[The Conversation — directive travailleurs de plateformes](https://theconversation.com/uber-deliveroo-bolt-une-directive-europeenne-pour-reintegrer-les-travailleurs-de-plateformes-au-sein-du-salariat-231334)

### B-4. Assurance 🔴
- **Véhicule motorisé** : **RC circulation** obligatoire, à **usage
  professionnel livraison** (l'assurance perso NE couvre PAS le transport pour
  autrui → non-assuré en cas d'accident).
- **RC professionnelle d'exploitation**.
- **Assurance des marchandises transportées** : le transporteur est **présumé
  responsable** des pertes/avaries (obligation de résultat).
- **Vélo** : pas d'assurance véhicule spécifique obligatoire, mais **RC pro
  recommandée**.
Sources : [Shippr — assurances pour livreurs](https://www.shippr.io/blog/assurances-pour-livreurs) ·
[AXA PRO — RC des professionnels du transport](https://www.axa.fr/pro/responsabilite-civile-professionnelle/rc-transports.html)

### B-5. RGPD & géolocalisation (CNIL)
- Cadre : **RGPD** + **ePrivacy (art. 82 loi Informatique et Libertés)**.
- **Finalité** déterminée, explicite, légitime (suivre/justifier/facturer la
  course ; sécurité coursier/marchandises).
- **Conservation** des données de localisation : **≤ 2 mois** en principe.
- **Désactivation** possible hors service / usage privé.
- **Information claire** des personnes ; base légale (consentement / exécution du
  contrat). Registre des traitements ; **AIPD** probable (géoloc = risque élevé).
- Plus de déclaration préalable CNIL depuis le RGPD.
Sources : [CNIL — géolocalisation des véhicules des salariés](https://www.cnil.fr/fr/la-geolocalisation-des-vehicules-des-salaries) ·
[CNIL — norme NS-51 (PDF)](https://www.cnil.fr/sites/default/files/atoms/files/ns51.pdf)

### B-6. Obligations fiscales de la plateforme (DAC7)
- **DAC7** (Dir. (UE) 2021/514) transposée aux **art. 1649 ter A à E du CGI**
  (remplace l'art. 242 bis CGI depuis 2024) : **déclaration annuelle** à la
  **DGFiP** des revenus des coursiers (utilisateurs), **avant le 31 janvier N+1**,
  puis échange automatique inter-UE.
- **Obligation d'informer** chaque coursier de ses **obligations sociales et
  fiscales** + lui transmettre un **récapitulatif annuel** de ses revenus.
Sources : [impots.gouv.fr — DPI-DAC7](https://www.impots.gouv.fr/transfert-dinformations-en-application-des-dispositifs-dpi-dac7-plateformes-deconomie-collaborative) ·
[BOFiP — transposition DAC7](https://bofip.impots.gouv.fr/bofip/13767-PGP.html/ACTU-2022-00152)

### B-7. Paiement / encaissement pour compte de tiers (DSP2)
- Encaisser pour reverser à un tiers = **service de paiement** → **agrément
  établissement de paiement (ACPR)** OU passer par un **PSP agréé**.
- **Stripe Connect** = la plateforme agit comme **agent/mandataire** de Stripe
  (Stripe porte l'agrément) → **pas d'agrément propre requis**. **Reco.**
- Exemption possible si volume < **1 M€/an**, mais Stripe Connect reste le plus
  simple et conforme. **Commission 0 %** possible (zéro bénéfice user).
Sources : [Deshoulières Avocats — encaissement pour compte de tiers & marketplace](https://www.deshoulieres-avocats.com/encaissement-pour-compte-de-tiers-et-marketplace-quel-cadre-juridique/) ·
[Wizaplace — paiement marketplace, cadre juridique](https://www.wizaplace.com/paiement-sur-une-marketplace-quel-cadre-juridique/)

### B-8. Permis deux-roues (coursiers)
- **AM** (ex-BSR) : cyclo 50 cm³ ≤ 45 km/h, dès **14 ans**, formation 8 h.
- **A1** : 125 cm³ / ≤ 11 kW, dès **16 ans**.
- **A2** : ≤ 35 kW, dès **18 ans**.
- **A** : toutes cylindrées (A2 → A après 2 ans).
- **Permis B** + **7 h** de formation (après 2 ans de permis) → 125 cm³.
→ Vérifier à l'onboarding la cohérence **permis ↔ cylindrée** du véhicule déclaré.
Source : [Mascotte Assurances — quel permis pour quelle moto](https://www.mascotte-assurances.fr/permis-am-a1-a2-a-b-quel-permis-pour-quelle-moto/)

### B-9. Statut « opérateur de plateforme en ligne »
- **Art. L111-7 Code de la consommation** (loi n° 2016-1321 « République
  numérique ») : obligations de **loyauté, clarté, transparence** — CGU,
  modalités de classement/référencement, relations contractuelles/rémunération,
  qualité des parties, **droits & obligations civils et fiscaux des parties**.
- Diffusion de **bonnes pratiques**.
Sources : [Légifrance — art. L111-7 Code conso](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033219601/2021-11-05) ·
[Légifrance — art. L111-7-1](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033207023)

### B-10. Divers
- **Âge coursier** : micro-entrepreneur dès **18 ans** (16 si émancipé) → viser
  **≥ 18 ans**.
- **Facturation** : mentions légales micro-entrepreneur obligatoires.
- **Sécurité alimentaire** : **N/A** (quincaillerie, pas de nourriture).

---

# PARTIE C — CHECK-LIST DE CONFORMITÉ / QUESTIONS POUR L'AVOCAT

1. 🔴 **Vélo vs scooter** : peut-on éviter la capacité transport léger (105 h) en
   imposant le **vélo/VAE** ? Sinon, comment gérer la capacité pour des coursiers
   en scooter ? (§B-1 — question n°1, bloquante).
2. 🔴 **Anti-requalification** : notre modèle (0 profit, 0 contrainte, barème
   librement accepté) suffit-il à écarter la présomption de salariat de la
   directive 2024 ? Quelles clauses CGU sécuriser ? (§B-3)
3. 🔴 **Assurance** : partenaire assureur pour RC circulation pro + marchandises ;
   qui souscrit (coursier) et que vérifie-t-on ? (§B-4)
4. 🟠 **Paiement** : valider Stripe Connect 0 % comme mandataire ; exemption
   < 1 M€ nécessaire ? (§B-7)
5. 🟠 **RGPD géoloc** : rédiger l'AIPD + la politique (finalité, ≤2 mois,
   désactivation). (§B-5)
6. 🟠 **DAC7** : mettre en place la déclaration DGFiP + le récap annuel coursier.
   (§B-6)
7. 🟠 **CGU / CGV** du service + mentions opérateur de plateforme. (§B-9)
8. 🟡 **Fiscalité coursier** : info obligations + seuils micro. (§B-2)

---

# PRÉREQUIS AVANT ACTIVATION (`COURIER_ENABLED = true`)
Entreprise créée → **Stripe activé** → **partie quincaillerie** en ligne →
**feu vert avocat** (§C). Jusque-là : on construit tout, **inactif**.
