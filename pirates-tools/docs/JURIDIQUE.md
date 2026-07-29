# REGISTRE JURIDIQUE — ce qui engage la responsabilité

> ⚠️ **Ce document n'est PAS une source de droit.** Il nomme l'obligation, il
> désigne **où la vérifier**, et il dit ce qu'on risque. Chaque référence
> d'article doit être **revérifiée à la source officielle** avant d'être opposée
> à quoi que ce soit — un numéro d'article cité de mémoire est exactement le
> genre d'invention que le protocole §8 interdit.
>
> ⛔ **Je ne suis pas juriste.** Sur un point qui engage vraiment, la réponse
> est : « voici la source officielle, voici ce qu'elle dit, fais-la relire ».

---

## SOMMAIRE — cinq domaines qui exposent

| Réf | Domaine | Ce qu'on risque | Fichiers sous porte |
|---|---|---|---|
| **J1** | Information légale du site | vente illicite en B2C | 1 — `index.html` *(mentions, CGV, confidentialité)* |
| **J2** | Statut des livreurs | requalification en salariat | 2 — `api/contact.js`, `api/_lib/courses.js` |
| **J3** | Données personnelles | sanction CNIL | 12 — règles Firestore/Storage + tout point d'entrée qui touche une adresse, un e-mail ou un consentement |
| **J4** | Prix et promotions | pratique commerciale trompeuse | 9 — `products.json` + toute la chaîne de calcul et d'affichage du prix |
| **J5** | Fiscalité DOM | redressement | 9 — TVA, octroi de mer, facturation, comptabilité |

La liste **exacte** n'est pas recopiée ici : elle vivrait à côté du code et
divergerait. Elle se lit de la seule source qui décide :

```bash
cd pirates-tools && node scripts/juridique.js --controle   # cohérence + angles morts
```

⚠️ **Ce tableau a d'abord couvert 8 fichiers, puis 20.** L'écart n'a pas été
trouvé à l'œil : c'est le détecteur d'angles morts de `scripts/juridique.js` qui
a signalé qu'`api/contact.js` portait **91** marqueurs de données personnelles
sans être rattaché à J3. Une table écrite à la main oublie ; le contrôle qui la
relit ne peut plus la laisser oublier en silence.

---

## J1 — INFORMATION LÉGALE DU SITE

**L'obligation.** Un site marchand destiné à des particuliers doit publier
l'identité complète de l'éditeur, des conditions générales de vente, une
politique de confidentialité, et désigner un **médiateur de la consommation**.

**Sources à consulter — obligatoire avant toute affirmation**
- `economie.gouv.fr` → obligations d'information du vendeur en ligne
- `legifrance.gouv.fr` → Code de la consommation, livre II
- `cnil.fr` → mentions relatives aux données

**Ce qu'on risque.** Vendre à des particuliers sans ces éléments est une
infraction, pas une négligence. Le droit de rétractation mal informé
**s'allonge automatiquement**.

**État constaté** *(`grep -c 'À COMPLÉTER' index.html` → 23)* : **non conforme**.
Voir `docs/ETAT.md` › L1 à L4.

---

## J2 — STATUT DES LIVREURS

**L'obligation.** Une plateforme qui **fixe le prix** de la prestation et
**dirige** le prestataire s'expose à la requalification de la relation en
contrat de travail.

**Sources**
- `legifrance.gouv.fr` → Code du travail, dispositions sur les travailleurs des
  plateformes
- Directive **(UE) 2024/2831** relative au travail via une plateforme —
  transposition attendue **avant le 02/12/2026**

**Ce que le site fait, et pourquoi** *(décision D-009)*
- Le livreur fixe **librement** ses tarifs.
- La plateforme **n'encaisse pas** la course.
- Le tri de l'annuaire **ne dépend jamais du prix** — sinon c'est une sanction
  déguisée, donc un lien de subordination.

⛔ **Toute modification qui ferait fixer, plafonner ou classer par le prix
inverse cette protection.** Ce n'est pas de l'ergonomie, c'est du droit.

---

## J3 — DONNÉES PERSONNELLES

**L'obligation.** Base légale, minimisation, durée de conservation, droit à
l'effacement, information claire. Le consentement à la mesure d'audience doit
être **aussi facile à refuser qu'à accepter**.

**Sources**
- `cnil.fr` → cookies et traceurs, durées de conservation
- Règlement **(UE) 2016/679** (RGPD)

**Ce que le site fait**
- Bandeau à choix réel, refus au même niveau que l'accepter *(D-005)*.
- Aucune donnée personnelle dans les journaux serveur *(audit p6)*.
- Suppression de compte disponible *(droit à l'effacement)*.
- Vidéos de litige : consentement des deux parties, **effacées à la clôture**.

⚠️ Le RGPD s'applique **pleinement** dans les DOM-TOM.

---

## J4 — PRIX ET PROMOTIONS

**L'obligation.** Le prix annoncé doit être **exact et complet** (TTC, frais
compris). Une réduction annoncée se réfère au **prix le plus bas pratiqué
sur les 30 jours précédents**.

**Sources**
- `economie.gouv.fr` → annonces de réduction de prix
- Code de la consommation → pratiques commerciales trompeuses

⛔ **Un « prix conseillé » ou un tarif fournisseur gonflé n'est PAS un prix de
référence.** C'est précisément ce que la règle interdit. *(Voir D-004.)*

---

## J5 — FISCALITÉ DOM

**L'obligation.** TVA au taux applicable au territoire de livraison, **octroi de
mer** et octroi de mer régional pour les départements concernés.

**Sources — les seules opposables**
- `impots.gouv.fr` → TVA dans les DOM
- `douane.gouv.fr` → octroi de mer, taux par produit
- `bofip.impots.gouv.fr` → doctrine fiscale

**Ce que le site fait** : territoire dérivé du **code postal**, jamais d'un
champ déclaré par le client. Taux vérifiés par `scripts/audit/p5-money.js`.

⛔ **Règle absolue** : ne jamais répondre « demande à ton comptable ». On
cherche à la source officielle, on répond **sourcé et daté**, et on l'écrit
dans `docs/METHODE-ENTREPRISE-FISCALITE.md`.

---

## Comment cette porte s'ouvre

Modifier un fichier de la colonne « fichiers concernés » **exige** d'avoir
d'abord lu la fiche du domaine :

```bash
cd pirates-tools && node scripts/juridique.js J2
```

`scripts/garde-entonnoir.js --garde` **refuse** l'édition sans cette lecture.
Ce n'est pas une formalité : chaque fiche dit ce qu'on risque et où vérifier.
