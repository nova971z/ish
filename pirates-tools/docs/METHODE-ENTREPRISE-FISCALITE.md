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
