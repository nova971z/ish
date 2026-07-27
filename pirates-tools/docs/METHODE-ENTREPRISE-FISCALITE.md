# Méthode d'entreprise & fiscalité — Pirates Tools

> **SOURCE DE VÉRITÉ FISCALE DU PROJET.** À lire AVANT toute question de prix,
> de marge, de TVA, de statut ou de trésorerie. Toute affirmation fiscale
> donnée à l'user doit être vérifiée ici d'abord ; si l'info manque, la
> chercher aux sources officielles (liste en bas) et l'ajouter ici.
>
> Règle de l'user (26/07/2026, gravée) : **« On n'a pas besoin de demander à un
> comptable étant donné que tout est public. »** L'expert-comptable interviendra
> UNIQUEMENT sur la validation juridique/protection, PAS sur la gestion des
> comptes. Donc : ne JAMAIS répondre « demande à ton comptable » sur un point
> factuel et public — le chercher et le donner, sourcé et daté.

Dernière vérification des chiffres : **26 juillet 2026**.

---

## 1. Statut retenu — GRAVÉ

| Élément | Valeur |
|---|---|
| Forme juridique | **SASU** |
| Régime fiscal | **Impôt sur les sociétés (IS)** — de plein droit pour une SASU |
| Régime TVA | **Réel normal, assujetti** — déclaration **CA3 mensuelle** |
| Franchise en base de TVA | ⛔ **REFUSÉE par l'user** (26/07/2026) : « mon site est ma marque, je vais créer mes propres produits à terme, donc aucune franchise » |
| Lieu d'établissement | **Guadeloupe (971)** |

⚠️ Conséquence directe pour le code : le moteur de prix (`api/_lib/pricing-model.js`)
suppose la **TVA récupérable** (`tvaFR: 0.20`, coût réel = TTC ÷ 1,20). C'est
**CORRECT** avec ce statut. Il n'existe pas de mode « franchise » et il n'en faut pas.

---

## 2. Taux applicables (vérifiés 2026)

### TVA
| Territoire | Taux normal | Taux réduit |
|---|---|---|
| Métropole (achats fournisseur) | 20 % | — |
| **Guadeloupe / Martinique / Réunion** | **8,5 %** | 2,1 % |
| Guyane / Mayotte | **TVA non applicable** | — |

### Impôt sur les sociétés
- **15 %** jusqu'à **42 500 €** de bénéfice ;
- **25 %** au-delà.
- Conditions cumulatives du taux réduit : CA HT < 10 M€, **capital entièrement
  libéré** et détenu à **≥ 75 % par des personnes physiques**. ✅ Une SASU
  détenue à 100 % par l'user remplit ces conditions — mais le capital doit être
  **intégralement libéré** (à ne pas oublier à la création).

---

## 3. Le circuit de la TVA — LE POINT QUI INQUIÉTAIT L'USER

L'user craignait de « récupérer la TVA seulement en fin d'année » et donc
d'avoir un trou de trésorerie toute l'année. **C'est faux avec le régime retenu.**

### a) Achat chez un fournisseur métropolitain livré en métropole
- Facture **TTC à 20 %** (ex. cotébrico 454,62 € TTC = 378,85 € HT + 75,77 € TVA).
- La TVA payée est **déductible** et récupérée sur la **CA3 du mois suivant**.
- Avance de trésorerie réelle : **~1 mois**, jamais un an.

### b) Vente métropole → DOM = EXPORTATION EXONÉRÉE (art. 294-2 CGI)
Les DOM (Guadeloupe, Martinique, Réunion) et la métropole sont **territoires
d'exportation l'un pour l'autre**. Un fournisseur métropolitain qui **expédie
lui-même** vers la Guadeloupe doit facturer **HT**, mention obligatoire
« *Exonération de TVA, art. 294 du CGI* ».
→ Dans ce cas l'user **n'avance même pas les 20 %**.
⚠️ **Cotébrico n'expédie PAS en Guadeloupe** (constaté par l'user, 26/07/2026 —
uniquement Europe ; leur franchise locale « Brico Brico » vend beaucoup plus
cher). Donc en pratique : livraison en métropole → cas (a) → réexpédition par
l'user. À re-tester avec un **compte pro** cotébrico, et à demander
systématiquement à tout nouveau fournisseur (ça supprime l'avance de TVA).

### c) Importation dans le DOM
- **Octroi de mer** (externe) + **TVA à l'import** dus à l'entrée.
- **AUTOLIQUIDATION DE LA TVA À L'IMPORT : OBLIGATOIRE ET AUTOMATIQUE depuis le
  1er janvier 2022** pour tout assujetti identifié à la TVA en France. La TVA
  d'import est **déclarée et déduite simultanément sur la CA3** → **aucun
  décaissement en douane**, zéro avance de trésorerie.
- La CA3 est **préremplie automatiquement le 14 du mois** (espace pro
  impots.gouv.fr), à vérifier et valider **avant le 24**.
- ⚠️ L'**octroi de mer**, lui, **n'est PAS récupérable** → c'est un vrai coût.
  Le moteur de prix le traite bien comme tel (`octroiPaid`, calculé sur la
  valeur CIF = coût + fret).

### d) Structurellement en CRÉDIT de TVA
L'user **achète à 20 %** (métropole) et **encaisse à 8,5 %** (Guadeloupe).
→ TVA déductible > TVA collectée en permanence = **crédit de TVA chronique**.
- Au **réel normal**, le remboursement se demande **chaque mois** dès que le
  crédit dépasse **760 €** (formulaire n° 3519-SD, ligne 25/26 de la CA3, 100 %
  en ligne depuis l'espace pro).
- 👉 **C'est l'État qui doit de l'argent à l'entreprise, remboursable
  mensuellement.** Il ne faut donc SURTOUT pas choisir le régime simplifié
  (déclaration annuelle CA12) : c'est LUI qui créerait le trou de trésorerie
  redouté. **Opter pour le réel normal mensuel dès la création.**

### e) « Suis-je en perte pendant le mois où j'attends la TVA ? » → **NON**
Question posée par l'user le 26/07/2026. Calcul vérifié sur DHS900Z (coût réel
454,62 € TTC, prix client Guadeloupe 663,01 € TTC) :

| Le jour de la vente, AVANT toute récupération de TVA | € |
|---|---|
| Achat fournisseur TTC (dont 75,77 € de TVA avancée) | −454,62 |
| Transport Colissimo OM1 | −64,00 |
| FTD douane | −5,10 |
| Octroi de mer à l'import | −42,07 |
| Stripe | −10,20 |
| Emballage + quote-part frais fixes | −3,00 |
| **Total sorties** | **−578,99** |
| **Encaissement client (TTC 971)** | **+663,01** |
| **➡️ TRÉSORERIE IMMÉDIATE** | **+84,02 €** |

Puis à la CA3 du mois suivant : TVA collectée −51,94 / TVA déductible +75,77
= **crédit de +23,83 €**. Total 107,85 € − IS 16,18 € = **91,67 € net = 15,00 %**.

**Raison de fond** : le prix de vente couvre le prix d'achat **TTC**, pas
seulement le HT. La TVA avancée est donc déjà récupérée via l'encaissement
client ; le remboursement de l'État vient **en plus**. Il n'y a JAMAIS de mois
en perte à cause de la TVA.

**La seule vraie contrainte de trésorerie = le STOCK** (payer la marchandise
avant de l'avoir vendue), pas la TVA. Le modèle actuel (Colissimo à l'unité,
achat chez cotébrico APRÈS paiement du client) supprime ce besoin : aucune
avance. Il ne réapparaîtra qu'au passage aux **imports groupés par conteneur**
→ chiffrer le besoin en fonds de roulement AVANT de basculer.

---

## 4. Prix de vente : TTC ou HT ?

**L'user vend en TTC.** Le site affiche des prix TTC toutes taxes comprises
(client particulier B2C, promesse « rien à payer à l'arrivée »).

Le « HT » n'est **qu'une base de calcul comptable** : la TVA encaissée
n'appartient pas à l'entreprise, elle est reversée à l'État. C'est pourquoi la
**marge nette de 15 % se calcule sur le revenu HT** — compter la TVA dans le
chiffre d'affaires reviendrait à compter l'argent de l'État comme le sien.

---

## 5. Ce que le moteur de prix prend en compte (vérifié)

`api/_lib/pricing-model.js` — cible : **15 % net APRÈS IS**, client à **0 € à
l'arrivée (DDP)**. Décomposition vérifiée sur DHS900Z (5,3 kg, coût réel
454,62 € TTC) :

| Poste | Montant |
|---|---|
| Coût HT (TVA FR récupérée) | 378,85 € |
| Transport Colissimo OM1 | 64,00 € |
| **Douane / option FTD Colissimo** | 5,10 €/colis |
| Octroi de mer payé à l'import (non récupérable) | 42,07 € |
| Commission Stripe | 10,20 € |
| Emballage + quote-part frais fixes | 3,00 € |
| IS | 16,18 € |
| **Net après IS** | **91,67 € = 15,00 %** |

✅ Vérifié sur les **206 vrais produits** : marge nette obtenue = **15,00 % pile**
pour tous (`scripts/check-pricing-model.js` + contrôle ad hoc 26/07/2026).

### Angles morts connus (à traiter avant lancement)
1. **304 fiches quincaillerie à 1 € symbolique** : marge fortement négative —
   un petit article ne peut pas absorber 14 € de Colissimo + 5,10 € de FTD.
   Ce n'est pas un bug de calcul, c'est la réalité de l'envoi à l'unité →
   ces produits doivent passer par un **mode d'envoi groupé/local** (le service
   de livraison coursier) avant d'être ouverts à la vente.
2. **Trajet fournisseur → hub métropole** non chiffré dans le modèle (supposé
   gratuit si franco de port chez cotébrico). À valider.
3. Grille Colissimo : points 5 kg et 30 kg officiels 2026 ; **intermédiaires
   estimés** → à confirmer sur laposte.fr.

---

## 5 bis. ⚠️ SERVICE DE LIVRAISON — LA PLATEFORME A UNE RESPONSABILITÉ SOCIALE LÉGALE
**Découvert à l'audit du 27/07/2026. Point le plus lourd du projet.**

**Article L7342-1 du Code du travail** : « Lorsque la plateforme **détermine les
caractéristiques de la prestation** de service fournie **et fixe son prix**, elle
a, à l'égard des travailleurs concernés, **une responsabilité sociale**. »

⚠️ Pirates Tools tombe **exactement** dans ce champ : l'user fixe lui-même le
barème (22 / 48 / 74 / 100 € par zone) ET les caractéristiques (zones, créneaux,
photos obligatoires, code de remise). **Le fait de ne prendre AUCUN bénéfice sur
la course ne sort PAS du champ** — c'est la fixation du prix et des
caractéristiques qui déclenche l'obligation, pas la marge.

Obligations qui en découlent (chapitre L7342-1 à L7342-11) :
- **Cotisation d'assurance accident du travail PRISE EN CHARGE par la
  plateforme** (art. L7342-2), dans la limite d'un plafond fixé par décret —
  sauf si la plateforme souscrit elle-même un contrat collectif équivalent.
- Contribution à la **formation professionnelle** des travailleurs.
- **Droit de refuser une prestation sans sanction** (aucune pénalité, aucun
  déclassement) — à refléter dans le code ET dans les conditions livreur.
- Droit de constituer une organisation syndicale / d'action collective.
- **Charte de responsabilité sociale** facultative mais **homologable** par
  l'autorité administrative (réponse sous 4 mois) : l'homologation sécurise
  contre la requalification.

🔴 RISQUE MAJEUR ASSOCIÉ — **requalification en contrat de travail**. La
jurisprudence (Uber, Deliveroo) requalifie quand la plateforme exerce un
pouvoir de direction, de contrôle et de sanction. Points de vigilance dans
notre modèle : barème imposé, obligations de preuve (code + 2 photos),
possibilité de « bloquer » un livreur. À faire valider par un avocat AVANT
d'ouvrir le service.

⚖️ **ENCAISSEMENT POUR COMPTE DE TIERS** — le modèle « le client paie tout, on
gèle la part du livreur » = détention de fonds appartenant à un tiers. Illégal
sans agrément… SAUF en passant par un prestataire agréé. **Stripe Connect est
donc OBLIGATOIRE avant toute ouverture réelle** (l'escrow actuel sur notre
propre solde n'est acceptable qu'en TEST, avec nos propres comptes).

Sources : Légifrance L7342-1 à L7342-11
https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006072050/LEGISCTA000033013020/
· art. L7342-2 (assurance AT) https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000039678037

### 🔑 LA PARADE (validée sur le texte, 27/07/2026)
Les deux conditions de L7342-1 sont **CUMULATIVES** (« détermine les
caractéristiques **ET** fixe son prix »). **Il suffit d'en casser UNE** pour
sortir du champ. La plus simple à casser est le PRIX.

**Montage cible en 3 pièces :**
1. **Le prix appartient au LIVREUR.** Le barème par zone devient un tarif
   **proposé** que chaque livreur reprend, augmente ou baisse dans son profil.
   Le client voit le tarif DU livreur qu'il choisit. La plateforme ne fixe plus
   rien → L7342-1 ne s'applique plus. ⚠️ Il faut que la liberté soit RÉELLE
   (modifiable à tout moment, tarifs réellement différents d'un livreur à
   l'autre) — un « barème conseillé » que personne ne peut changer serait
   requalifié en prix fixé par la plateforme.
2. **L'argent ne transite plus par Pirates Tools.** Le client paie le livreur
   directement (Stripe Connect en *direct charges*, le livreur est le marchand).
   → supprime aussi l'encaissement pour compte de tiers.
3. **Aucun lien de subordination** (protège de la requalification, qui reste
   possible hors L7342) : pas d'exclusivité, droit de refuser sans conséquence,
   pas de déclassement algorithmique, pas de sanction automatique.

### ⚠️ LE REVERS À CONNAÎTRE — capacité de transport
Dès que le livreur **facture directement son client**, il exerce le transport
public routier de marchandises pour son propre compte. Or :
- **Véhicule MOTORISÉ, y compris à moins de 4 roues** (scooter, moto,
  triporteur électrique) → **inscription obligatoire au registre des
  transporteurs** (DREAL) + **attestation de capacité professionnelle**
  transport léger + capacité financière (~1 800 € pour le 1er véhicule).
- **Cycle à pédalage assisté (VAE)** → **N'EST PAS un véhicule motorisé** au
  sens de la réglementation transport : une entreprise n'utilisant que des VAE
  **n'est PAS inscrite** au registre. → **AUCUNE de ces obligations.**

👉 CONSÉQUENCE DIRECTE SUR LE MODÈLE : le **VAE est la seule monture qui permet
« zéro contrainte au livreur »**, ce que l'user voulait dès le départ. Le
scooter/moto reste possible mais impose au livreur un vrai parcours
administratif — à afficher honnêtement dans le dossier livreur. Cela recoupe
l'intuition de l'user (« les vélos ne feront que Sainte-Anne / Saint-François /
Le Moule ») : zones 1-2 en VAE sans contrainte, zones 3-4 en motorisé avec
capacité de transport.

Sources : Ministère de la Transition écologique — accès à la profession de
transporteur de marchandises
https://www.ecologie.gouv.fr/politiques-publiques/acces-exercice-profession-transporteur-marchandises
(« les entreprises utilisant des véhicules motorisés, y compris ceux ayant moins
de quatre roues, quel que soit leur tonnage, doivent être inscrites au registre » ;
« les cycles à pédalage assisté ne sont pas considérés comme des véhicules
motorisés »)

---

## 5 ter. VENTE À DISTANCE — obligations du tunnel de paiement
- **Art. L221-14 al. 2 C. conso** : le bouton de validation DOIT porter
  « commande avec obligation de paiement » ou une formule analogue non
  ambiguë. Sanction : **NULLITÉ du contrat** + amende administrative jusqu'à
  **15 000 €** pour une personne morale. ✅ CORRIGÉ le 27/07/2026 (SW v494) —
  le bouton portait « Payer en toute sécurité », non conforme.
- ✅ Case d'acceptation des CGV + politique de confidentialité posée avant tout
  débit (preuve du consentement), re-demandée à chaque commande.
- 🔴 RESTE : **médiateur de la consommation** — l'adhésion est OBLIGATOIRE pour
  vendre aux particuliers (art. L612-1 C. conso), ses coordonnées doivent
  figurer dans les CGV et les mentions légales.
Source : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226854

---

## 6. Sources officielles (à re-vérifier chaque janvier — loi de finances)

- TVA DOM (taux) — impots.gouv.fr :
  https://www.impots.gouv.fr/professionnel/questions/quels-sont-les-differents-taux-de-tva-applicables-dans-les-dom
- Livraisons métropole → DOM, exonération art. 294 CGI — impots.gouv.fr :
  https://www.impots.gouv.fr/professionnel/questions/depuis-la-metropole-je-fais-une-livraison-de-marchandises-dans-les-dom-dois
- Régime territorial TVA DOM — BOFiP BOI-TVA-GEO-20-40 :
  https://bofip.impots.gouv.fr/bofip/792-PGP.html/identifiant=BOI-TVA-GEO-20-40-20211222
- Autoliquidation TVA à l'import (obligatoire depuis 2022) — douane.gouv.fr :
  https://www.douane.gouv.fr/demarche/beneficier-automatiquement-de-lautoliquidation-de-la-tva-limport
- Import d'un bien dans un DROM (octroi de mer + TVA) — douane.gouv.fr :
  https://www.douane.gouv.fr/demarche/importer-un-bien-dans-un-drom
- Remboursement de crédit de TVA (seuil 760 € mensuel) — impots.gouv.fr :
  https://www.impots.gouv.fr/professionnel/questions/comment-faire-ma-demande-de-remboursement-de-credit-de-tva
- Remboursement de crédit de TVA — economie.gouv.fr :
  https://www.economie.gouv.fr/entreprises/gerer-sa-fiscalite-et-ses-impots/autres-impots-et-taxes/comment-obtenir-un
- Taux réduit d'IS (critère CA) — impots.gouv.fr :
  https://www.impots.gouv.fr/actualite/taux-reduit-dimpot-sur-les-societes-le-critere-du-chiffre-daffaires-revu-pour-les

---

## 7. Checklist à la création de la société

- [ ] SASU immatriculée, **capital entièrement libéré** (condition du taux d'IS à 15 %).
- [ ] **Opter pour le régime réel normal de TVA (CA3 mensuelle)** — pas le
      simplifié : c'est ce qui permet le remboursement mensuel du crédit de TVA.
- [ ] Vérifier que l'autoliquidation de la TVA à l'import est bien active
      (automatique, mais à contrôler sur la 1re CA3 préremplie le 14).
- [ ] Demander un **compte pro** à chaque fournisseur métropolitain et exiger la
      facturation **HT art. 294 CGI** dès qu'il expédie lui-même vers le DOM.
- [ ] Reporter le n° de TVA intracommunautaire dans la config facture
      (`config/invoice`, `franchise: false`).
