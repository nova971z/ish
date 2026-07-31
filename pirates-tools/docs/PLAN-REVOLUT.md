# 🔵 Migration Stripe → Revolut Merchant API — plan d'action

> **État : PLAN SEUL. Aucune ligne de code n'a été écrite.**
> Décidé le 31/07/2026. Motif : le délai de versement Stripe (7 jours ouvrés au
> premier virement, ~3 jours ouvrés ensuite) oblige à avancer la trésorerie de
> chaque commande. Revolut Business met les fonds sur le compte Merchant sous
> 24 h, week-ends compris, avec retrait instantané et gratuit vers le compte
> Business, et des commissions annoncées plus basses.

## Règle de ce document

Tout ce qui est écrit ici vient **soit du code mesuré**, soit de la **référence
Merchant API `2026-04-20`** fournie par l'user. Rien n'est déduit, rien n'est
supposé. Ce qui n'est pas connu est listé au chapitre « Ce qui manque encore »
— et **rien ne se code avant** que ces trous soient bouchés à la source.

⛔ Les pages `developer.revolut.com`, `docs.stripe.com` et `support.stripe.com`
répondent **403** depuis l'environnement de travail. Toute information non
présente dans ce document doit être copiée-collée depuis la doc officielle par
l'user. Une URL ou un nom de champ écrit de mémoire est une invention, et sur
le chemin de l'argent une invention se paie.

---

# 1. Inventaire 1=1 de l'existant

## 1.1 Les deux flux de paiement du site

Le site encaisse par **deux chemins distincts**, et le webhook les traite
séparément — c'est écrit noir sur blanc dans `api/webhook.js` (en-tête, point 3).

| | Flux **Elements** (principal) | Flux **Checkout** (redirection) |
|---|---|---|
| Création | `api/create-payment-intent.js:224` — `stripe.paymentIntents.create` | `api/checkout.js:125` — `stripe.checkout.sessions.create` |
| Appelé par | `app.js:10115` `initStripeElements()` | `app.js:10406` |
| Rendu | `app.js:10191` `stripe.elements()` + `.create('payment')` | redirection vers `session.url` |
| Confirmation | `app.js:10313` `stripe.confirmPayment({ return_url: …#/merci })` | retour `success_url` |
| Événement webhook | `payment_intent.succeeded` | `checkout.session.completed` |
| Handler | `handleIntentSucceeded` (`webhook.js:276`) | `handleSessionCompleted` (`webhook.js:222`) |
| Remise fidélité | soustraite du montant (`create-payment-intent.js:157`) | **coupon Stripe** `stripe.coupons.create` (`checkout.js:116`) |
| Adresse | envoyée par la modale, attachée au PI | `shipping_address_collection` |

## 1.2 Les 8 appels au SDK Stripe — mesurés

```
$ grep -n "stripe\." api/*.js
checkout.js:116              stripe.coupons.create
checkout.js:125              stripe.checkout.sessions.create
contact.js:760               stripe.paymentIntents.retrieve       (vérif serveur)
contact.js:1037              stripe.paymentIntents.retrieve       (vérif serveur)
contact.js:1493              stripe.transfers.create              (Stripe Connect livreur)
create-payment-intent.js:224 stripe.paymentIntents.create
webhook.js:80                stripe.webhooks.constructEvent       (signature)
webhook.js:228               stripe.checkout.sessions.retrieve
webhook.js:293               stripe.charges.retrieve
webhook.js:321               stripe.balanceTransactions.retrieve  (COMMISSION RÉELLE)
```

## 1.3 Ce qui dépend de Stripe hors SDK

| Emplacement | Quoi |
|---|---|
| `index.html:96` | `window.PT_STRIPE_PK = 'pk_test_…'` — **script inline autorisé par empreinte sha256 dans la CSP** |
| `index.html:2232` | `<script src="https://js.stripe.com/v3/" async>` |
| `index.html:36-37` | `preconnect` / `dns-prefetch` vers `js.stripe.com` |
| `index.html:1814-1818` | conteneurs `#stripeElementsWrap`, `#stripePaymentElement`, `#stripeCardError` |
| `vercel.json` CSP | `script-src … https://js.stripe.com` · `connect-src … https://api.stripe.com` · `frame-src https://js.stripe.com https://hooks.stripe.com` |
| `api/health.js:39-40` | expose la présence de `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` |
| Variables Vercel | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Firestore | collection `stripe_events/{id}` (idempotence), champ `payments/*.stripeFeeCents`, `stripeSessionId`, `stripePaymentIntent`, `paymentIntentId` |
| `api/_lib/stripe-meta.js` | découpe les lignes de commande en `items_0…items_N` (**≤ 500 car./valeur, ≤ 50 clés — limites Stripe**) |
| `api/_lib/accounting.js` | consomme `stripeFeeCents` — c'est ce qui rend la compta « 100 % réelle » |

## 1.4 Les invariants qu'on ne casse sous aucun prétexte

Ils viennent tous d'une panne ou d'un audit déjà payés. Chacun survit à la
migration ou la migration ne se fait pas.

1. **Le serveur est seul maître du montant.** `create-payment-intent.js:4-7` :
   le client envoie `{key, qty}`, jamais un prix. Ferme le trou « payer 1
   centime ».
2. **Le territoire fiscal vient du CODE POSTAL**, re-dérivé serveur
   (`create-payment-intent.js:66-77`). `body.territory` est ignoré. Sans ça :
   paiement au taux Mayotte, ≈ −19 %.
3. **Le webhook lit le corps BRUT.** `webhook.js:206-208` désactive le
   `bodyParser`. Un corps parsé puis re-sérialisé ne reproduit pas les octets
   signés.
4. **Idempotence par machine à états** sur `stripe_events/{event.id}` :
   `processing` → `done` / `failed`. Un échec renvoie **500** pour que le
   fournisseur RE-LIVRE ; répondre 200 sur échec perd l'événement à jamais
   (`webhook.js:88-98`).
5. **Trace serveur systématique** : `logPayment` écrit `payments/{id}` même si
   le client ne crée jamais son document de commande.
6. **Contrôle fiscal détectif** : le territoire déclaré est comparé au code
   postal de l'adresse réellement collectée ; `taxMismatch` est journalisé.
7. **Commission réelle**, jamais estimée (`webhook.js:317-324`).
8. **Coût d'achat snapshoté à la vente** (`cogsHtCents`).
9. **Numéro de facture séquentiel**, réutilisé à l'identique en reprise.
10. **Emails dédupliqués** par `emailsSent` sur le claim.
11. **Rate-limit** 20/h/IP sur la création de paiement (`create-payment-intent.js:41`).
12. **La clé publique vit dans un script inline autorisé par sha256** : la
    changer sans recalculer l'empreinte CSP **tue le site**.

---

# 2. Correspondance Stripe → Revolut

> Colonne « Revolut » : **uniquement** ce qui figure dans la référence Merchant
> API `2026-04-20` fournie. Base : `https://merchant.revolut.com/api`.
> En-têtes de toute requête serveur :
> `Authorization: Bearer <secretApiKey>` + `Revolut-Api-Version: 2026-04-20`.

| Besoin | Stripe aujourd'hui | Revolut — **confirmé par la référence** |
|---|---|---|
| Créer l'intention de paiement | `paymentIntents.create` | `POST /api/orders` → `{ id, token, state, checkout_url }` |
| Jeton pour le widget | `client_secret` | **`token`** (l'ancien `public_id` est déprécié) |
| Page de paiement hébergée | `checkout.sessions.create` → `session.url` | `checkout_url` = `https://checkout.revolut.com/payment-link/{token}` — **fourni par la même création d'ordre** |
| Relire l'état | `checkout.sessions.retrieve` | `GET /api/orders/{order_id}` |
| Détail carte / adresse | `charges.retrieve` → `billing_details` | `GET /api/payments/{payment_id}` → `billing_address`, `payment_method`, `payer.email` |
| **Commission réelle** | `balanceTransactions.retrieve().fee` | **`GET /api/payments/{payment_id}` → `fees: [{ type: "acquiring", amount, currency }]`** et `settled_amount` |
| Nos données sur la commande | `metadata` (≤50 clés, ≤500 car.) | `metadata` (objet) + `merchant_order_data.reference` |
| Remboursement | (non implémenté côté API) | `POST /api/orders/{order_id}/refund` `{amount, currency}` + en-tête `Idempotency-Key` → nouvel ordre `type:"refund"`, `related_order_id` |
| Webhook — inscription | tableau de bord | `POST /api/webhooks {url, events}` → **`signing_secret`** |
| Webhook — signature | `webhooks.constructEvent` | en-têtes `Revolut-Request-Timestamp` + `Revolut-Signature` — **algorithme non fourni, voir §4** |
| Webhook — événements | `payment_intent.succeeded` | `ORDER_COMPLETED`, `ORDER_AUTHORISED`, `ORDER_CANCELLED` |
| 3-D Secure | automatique | `enforce_challenge` |
| Capture différée | `capture_method` | `capture_mode: manual` + `POST /api/orders/{id}/capture` |
| Annulation | — | `POST /api/orders/{id}/cancel` |
| Litiges | tableau de bord | `GET /api/disputes`, `/accept`, `/challenge`, `/evidences` |
| Rapports comptables | — | `POST /api/report-runs` type `settlement_report` (colonnes `fee_amount`, `processing_fee_amount`, `settlement_amount`) |
| Widget navigateur | `js.stripe.com/v3` + `stripe.elements()` | `@revolut/checkout@1.1.25` — `RevolutCheckout(token, 'prod'\|'sandbox')` |
| CDN à autoriser en CSP | `js.stripe.com`, `api.stripe.com`, `hooks.stripe.com` | `merchant.revolut.com/embed.js` (prod) · `sandbox-merchant.revolut.com/embed.js` (bac à sable) — **lus dans le paquet npm, pas devinés** |

## 2.1 La différence structurelle qui commande toute la reprise du webhook

**La charge utile du webhook Revolut ne contient QUE ceci :**

```json
{ "event": "ORDER_COMPLETED",
  "order_id": "6634c172-3398-ac93-aee9-50de0282e3ac",
  "merchant_order_ext_ref": "Example reference #123" }
```

Ni montant, ni devise, ni client, ni commission, ni metadata.

Chez Stripe l'objet complet arrive dans l'événement. Ici il faudra, **à chaque
événement** :

1. `GET /api/orders/{order_id}` → montant, devise, état, `metadata`, `payments[]` ;
2. pour chaque `payments[i].id` → `GET /api/payments/{payment_id}` → `fees[]`,
   `settled_amount`, `billing_address`, `payer.email`.

Conséquences directes :
- **le webhook devient bavard** (2 appels réseau minimum au lieu de 0 à 1) ;
- **la clé d'idempotence change de nature.** `stripe_events/{event.id}` s'appuyait
  sur un identifiant d'ÉVÉNEMENT unique. Le payload Revolut n'en fournit **aucun**.
  La clé devra être dérivée de `event + order_id`. ⚠️ Cela signifie qu'une
  re-livraison du **même** couple est bien dédupliquée, mais il faut vérifier à la
  source qu'aucun scénario légitime n'émet deux fois le même couple.
- **la doc avertit que l'ordre d'arrivée n'est pas garanti** : « you should receive
  ORDER_AUTHORISED first and then ORDER_COMPLETED. However… you get ORDER_COMPLETED
  first and then ORDER_AUTHORISED ». Le traitement doit donc être commutatif —
  aujourd'hui il est écrit pour un événement unique et ordonné.

## 2.2 Le point qui sauve la comptabilité

La compta n'est « 100 % réelle » que parce que `stripeFeeCents` est la commission
**réellement prélevée**. L'équivalent existe, et c'est vérifié :

```json
"amount": 100, "settled_amount": 77, "settled_currency": "GBP",
"fees": [ { "type": "acquiring", "amount": 23, "currency": "GBP" } ]
```

`api/_lib/accounting.js` n'a donc pas à changer de nature : seul le nom du champ
alimenté change. **Point de vigilance** : `fees` est un **tableau** — il peut
contenir plusieurs types. On somme, on ne prend pas `fees[0]`.

## 2.3 Ce qui devient plus simple

- **Le coupon disparaît.** `checkout.js:116` crée un coupon Stripe uniquement
  parce que Checkout refuse une ligne négative. `POST /api/orders` prend un
  `amount` brut : la remise fidélité se soustrait avant, comme le flux Elements
  le fait déjà. Un objet de moins, une source d'écart de moins.
- **Un seul appel pour les deux flux.** `checkout_url` est renvoyé par la même
  création d'ordre que le `token` du widget. Les deux flux du site peuvent
  converger sur **un seul** point d'entrée serveur.

## 2.4 ⛔ Ce qui n'a AUCUN équivalent dans la référence fournie

**`stripe.transfers.create` — `api/contact.js:1493`.** C'est Stripe Connect :
le versement automatique des frais de course au livreur, après libération de
l'escrow. La Merchant API fournie n'expose que `GET /api/payouts` (consultation
des virements du compte Merchant vers le compte bancaire) — **rien pour verser
à un tiers**.

Le module livreur est aujourd'hui **inactif** (`COURIER_ENABLED=false`), donc
ça ne bloque pas la migration. Mais il faudra trancher avant de l'activer :
autre produit Revolut, virement manuel, ou rester sur Stripe pour ce seul flux.
**À ne pas découvrir le jour de l'ouverture du service.**

---

# 3. Le plan, par étapes

Chaque étape se termine par une preuve. Aucune ne commence avant que la
précédente soit verte.

## Étape 0 — Prérequis hors code (user)
- Entreprise créée, compte Revolut Business ouvert, compte Merchant activé.
- Clés API générées : **secrète** (serveur) et **publique** (checkout).
- Accès bac à sable.
- ⛔ Les clés ne transitent JAMAIS par une conversation ni par le dépôt.

## Étape 1 — La couture (réversibilité) — *ne dépend d'aucune doc manquante*
Les 8 appels passent derrière une interface unique, `api/_lib/paiement/`, avec
deux implémentations (`stripe.js`, `revolut.js`) et un aiguillage par variable
d'environnement.

**Pourquoi ce n'est pas de l'élégance** : c'est la seule façon d'avoir un retour
arrière. Si Revolut coince en production, on rebascule en changeant une variable,
sans redéployer du code de paiement dans l'urgence. Question 2 du protocole.

*Fini* : CI verte, `tests/course-pay.mjs` vert, `audit/p5-money.js` vert, et un
paiement Stripe de bout en bout rejoué **inchangé**.

## Étape 2 — Le module Revolut, serveur
`api/_lib/paiement/revolut.js` : création d'ordre, relecture, remboursement,
vérification de signature.
**Bloquée par §4.1** (algorithme de signature).

*Fini* : chaque fonction couverte par un contrôle prouvé faillible par sabotage,
et la vérification de signature refusant un corps modifié d'un seul octet.

## Étape 3 — Le webhook
Nouveau chemin : signature → `GET /orders/{id}` → `GET /payments/{id}` → mêmes
effets qu'aujourd'hui (journal, commande, facture, emails, course).
**Bloquée par §4.1 et §4.3** (états de l'ordre).

*Fini* : les 12 invariants du §1.4 rejoués un par un, et l'idempotence prouvée
par re-livraison du même couple `event + order_id`.

## Étape 4 — Le front
`@revolut/checkout` remplace `js.stripe.com`. CSP mise à jour, **empreinte
sha256 du script inline recalculée** (`node scripts/check-csp.js`), `?v=` et
`sw.js` bumpés.
**Bloquée par §4.2** (référence du widget).

*Fini* : `check-csp` vert, zéro violation CSP dans un vrai navigateur, formulaire
monté et carte de test acceptée en bac à sable.

## Étape 5 — Bac à sable de bout en bout
Paiement réel en sandbox : montant débité = montant affiché au centime,
`payments/` écrit, facture numérotée, emails partis, commission réelle enregistrée.

## Étape 6 — Bascule
Variable d'environnement basculée. Stripe reste branché et fonctionnel derrière
la couture pendant au moins une semaine. Un seul produit encaissé en vrai,
vérifié à l'euro sur le compte Merchant, avant d'ouvrir aux clients.

## Étape 7 — Nettoyage (et pas avant)
Retrait de `stripe` de `package.json`, des variables Vercel, des champs morts.
⛔ Ne jamais supprimer la collection `stripe_events` ni les champs `stripe*` des
paiements déjà encaissés : c'est l'historique comptable, il se conserve.

---

# 4. Ce qui manque encore — à copier-coller depuis la doc officielle

Classé par ce qui bloque le plus tôt.

## 4.1 ✅ RÉSOLU le 31/07/2026 — signature du webhook

Fourni par l'user depuis *Manage Accounts → Webhooks → Verify the payload
signature*, et **vérifié contre le vecteur de test officiel de cette page** :

```
payload_to_sign = "v1." + {Revolut-Request-Timestamp} + "." + {corps BRUT}
signature       = "v1=" + HMAC_SHA256(signing_secret, payload_to_sign).hex()
```

Mesure exécutée (`scratchpad`, hors dépôt) :

```
attendu : v1=bca326fb378d0da7f7c490ad584a8106bab9723d8d9cdd0d50b4c5b3be3837c0
obtenu  : v1=bca326fb378d0da7f7c490ad584a8106bab9723d8d9cdd0d50b4c5b3be3837c0
✅ ALGORITHME CONFIRMÉ sur le vecteur officiel
1) Buffer brut + préfixe   : ✅ CONFORME    (forme serveur, bodyParser désactivé)
1 octet modifié            → ✅ rejeté
horodatage modifié         → ✅ rejeté
```

### Quatre points d'implémentation, chacun mesuré

**a) Le corps DOIT être lu brut — prouvé, pas supposé.** Six formes de corps
donnent une signature FAUSSE si on parse puis re-sérialise :

```
⛔ espace après les deux-points   ⛔ indentation / retour ligne
⛔ unicode échappé é         ⛔ nombre 1.0        ⛔ nombre 1e2
⛔ barre oblique échappée \/
6/6 cas où parser le corps produirait une signature FAUSSE.
```

`api/webhook.js:206-208` désactive déjà le `bodyParser` : **cette ligne se garde
telle quelle**, elle vaut pour Revolut exactement comme pour Stripe.

**b) L'en-tête peut porter PLUSIEURS signatures.** La doc : *« must match exactly
the signature (**or one of the multiple signatures**) sent in that header »*.
C'est le mécanisme de `POST /api/webhooks/{id}/rotate-signing-secret` avec son
`expiration_period` : pendant la rotation, l'ancien et le nouveau secret sont
valides. Il faut donc découper l'en-tête et comparer à **chacune**. Vérifié :

```
4) en-tête à 2 signatures, la bonne en 1re : ✅ acceptée
5) en-tête à 2 signatures, la bonne en 2e  : ✅ acceptée
6) en-tête sans la bonne signature         : ✅ rejetée
7) en-tête vide                            : ✅ rejetée
```

**c) Comparaison à temps constant obligatoire.** `api/_lib/auth.js`
(`timingSafeEqualStr`) fait déjà exactement ça — on le réutilise, on ne le
réécrit pas.

**d) Filtrer par IP d'origine, en plus.** La doc donne les adresses :
production `35.246.21.235`, `34.89.70.170` · bac à sable `35.242.130.242`,
`35.242.162.241`. C'est une deuxième barrière, jamais la seule — une IP se
falsifie derrière un intermédiaire mal configuré.

### ⚠️ Deux réserves à lever avant de coder

1. **La page fournie est celle de la Business API**, pas de la Merchant API
   (fil d'Ariane : *Home → Manage Accounts → Webhooks*). Son exemple porte un
   événement `TransactionStateChanged`, qui n'existe pas côté Merchant. Les noms
   d'en-tête sont identiques et le `signing_secret` Merchant a le même préfixe
   `wsk_` — c'est un indice fort, **pas une preuve**.
   *Risque acceptable* : si le schéma diffère, le bac à sable rejettera **tous**
   les webhooks. C'est une panne bruyante, pas un trou silencieux. On code
   dessus, et le bac à sable tranche.
2. **« The raw webhook payload without whitespaces »** est ambigu. Deux lectures
   opposées : *« Revolut envoie du JSON compact, prends-le tel quel »* ou
   *« retire toi-même les espaces »*. La seconde contredit la phrase suivante de
   la même page — *« it is crucial not to alter the body »* — et les 6 cas du
   point (a). **On prend le corps tel quel, on ne le touche pas.** À confirmer
   au premier webhook réel en bac à sable.

### ⛔ Ce que la doc ne dit PAS : la fenêtre anti-rejeu

Aucune tolérance n'est indiquée pour `Revolut-Request-Timestamp`. Sans
vérification d'âge, une requête signée capturée peut être **rejouée
indéfiniment**. On retiendra **5 minutes**, valeur à écrire en clair dans le
code avec ce commentaire : *chiffre choisi par nous, pas lu chez Revolut, à
corriger si la doc le précise un jour.*

## 4.1 bis 🔴 NOUVEAU — combien de fois Revolut RE-LIVRE-T-IL un webhook ?

Découvert le 31/07/2026 en lisant la page webhooks du **Crypto Ramp** (produit
différent, mais le signal est trop gros pour être ignoré) :

> *« If a request sent to your webhook URL returns an HTTP error response or
> times out and the delivery of the events fails, Revolut will retry sending
> the webhook event **3 more times**. »*

⚠️ **Ce chiffre est celui du Crypto Ramp. Il n'est PAS transposable tel quel à
la Merchant API** — c'est exactement l'erreur à ne pas commettre. Mais il oblige
à poser la question, parce que **toute notre stratégie de reprise en dépend**.

`api/webhook.js:88-98` repose sur ceci : en cas d'échec d'un effet critique, on
marque le claim `failed` et **on répond 500 pour que le fournisseur re-livre**.
Chez Stripe, la re-livraison s'étale sur ~3 jours — c'est notre mécanisme de
retry, et il est généreux.

Si Revolut ne réessaie que 3 fois sur quelques minutes, ce mécanisme **ne suffit
plus** : une panne Firestore de dix minutes, et le paiement est encaissé sans
commande, sans facture, sans email — définitivement.

**Conséquence sur le plan** : si la Merchant API ne garantit pas une re-livraison
longue, l'étape 3 doit inclure un **rattrapage par réconciliation** — une tâche
qui liste `GET /api/orders?state=completed&from=…` et compare au journal
`payments/` pour retrouver ce qui n'a jamais été traité. Le webhook devient une
optimisation de latence, plus la seule source de vérité.

C'est une décision d'architecture, pas un détail. À trancher avec la réponse.

## 4.2 ✅ RÉSOLU le 31/07/2026 — le widget

Contrat lu **dans les définitions TypeScript du paquet npm officiel**
(`@revolut/checkout@1.1.25`, publié le 04/03/2026) — c'est l'API réellement
livrée, pas une page de documentation qui peut avoir pris du retard.

```js
const instance  = await RevolutCheckout(orderToken, 'prod' | 'sandbox');
const cardField = instance.createCardField({ target, styles, classes, theme,
                                             onSuccess, onError, onCancel,
                                             onValidation, onStatusChange,
                                             hidePostcodeField, locale });
cardField.submit({ name, email, phone, billingAddress, shippingAddress });
cardField.validate();
instance.destroy();
```

Correspondance avec l'existant :

| Aujourd'hui (`app.js`) | Demain |
|---|---|
| `stripe.elements({clientSecret})` (`:10191`) | `RevolutCheckout(token, mode)` |
| `elements.create('payment')` | `instance.createCardField({ target })` |
| `paymentElement.on('change', …)` | `onValidation(errors[])` + `onStatusChange(status)` |
| `stripe.confirmPayment({return_url})` (`:10313`) | `cardField.submit({…})` + `onSuccess` / `onError` / `onCancel` |
| `paymentElement.destroy()` | `instance.destroy()` |

`onStatusChange` renvoie `{ focused, invalid, empty, autofilled, completed }` —
`completed` remplace exactement le drapeau `_stripeReady`.

**Différence à ne pas rater** : Stripe redirige vers `return_url` ; Revolut
rappelle `onSuccess` **sans quitter la page**. La navigation vers `#/merci`
devient notre responsabilité, dans le callback. Le repli client de `/merci`
(étape A5) doit donc être revérifié : il s'appuyait sur un retour de redirection.

### ⛔⛔ LE PIÈGE LE PLUS DANGEREUX DE TOUTE LA MIGRATION

Documenté noir sur blanc sur la page *Accept payments via Card field* :

> *« Some sandbox payments **may still succeed without billingAddress**. **Do
> not treat that as production-ready behaviour.** For reliable production card
> acceptance, include `name`, `email`, and `billingAddress` in the widget
> flow. »*

**Le bac à sable passe au vert sans l'adresse de facturation. La production
refuse les paiements.** C'est exactement le mode de panne que le projet
combat depuis le début : un test vert pour la mauvaise raison. On validerait
tout en sandbox, on basculerait, et les cartes commenceraient à être refusées
sans qu'aucun contrôle n'ait rougi.

Trois champs obligatoires en production, à fournir dans `createCardField()` ou
dans `submit()` :

| Champ | Contenu |
|---|---|
| `name` | nom du porteur — ⚠️ pas de champ `cardholderName` séparé pour le card field |
| `email` | e-mail du client |
| `billingAddress` | `{ countryCode, postcode, city, streetLine1 }` |

`shippingAddress` reste facultatif ; s'il est fourni, il lui faut **au moins**
`countryCode` et `postcode`.

✅ **Bonne nouvelle** : la modale de paiement du site collecte DÉJÀ nom, ligne 1,
ville et code postal (`validatePayAddress`). Rien de neuf à demander au client —
il faut juste ne pas oublier de transmettre ces valeurs au widget.

⛔ **Filet posé AVANT le code** : `check-paiement.js` refuse tout `app.js` qui
appellerait `createCardField` sans `billingAddress`. Le contrôle dort tant que
la ligne n'existe pas, et mord dès qu'elle apparaît.

### Le contrat exact du champ carte (page Card field, Web)

```js
const { createCardField } = await RevolutCheckout(orderToken, 'sandbox');
const cardField = createCardField({
  target: document.getElementById('card-field'),
  name, email, billingAddress,          // ⛔ obligatoires en production
  onSuccess, onError, onCancel, onValidation,
  locale, theme, styles, classes, savePaymentMethodFor
});
cardField.submit(meta);   // meta peut porter name/email/billingAddress à la place
```

Le HTML se réduit à un `<div>` vide + un bouton qui appelle `submit()`. Les
conteneurs actuels (`#stripePaymentElement`, `#stripeCardError`) se recyclent.

### ⛔ Le SDK client n'expose JAMAIS l'origine de la carte

Vérifié en fouillant **tous** les fichiers de types du paquet : aucun champ
`bin`, `brand`, `funding`, `issuer`, ni pays de carte. Le seul `countryCode` qui
existe appartient à `Address` — l'adresse de facturation que le **client saisit
lui-même**, pas la carte.

Le pays de la carte n'apparaît qu'**après** le paiement, côté serveur
(`GET /api/payments/{id}` → `payment_method.card_country_code`).

Conséquence : la « notification carte internationale » demandée le 31/07 était
**techniquement impossible en plus d'être illégale** (voir §4.6 bis). Les deux
raisons sont indépendantes ; la juridique suffisait déjà.

## 4.3 ✅ RÉSOLU le 31/07/2026 — quel état signifie « l'argent est acquis »

**La réponse était déjà dans la référence Merchant API fournie.** Je la cherchais
sur une page dédiée alors que quatre phrases de la référence la donnent, et une
seule suffit à trancher. Citations exactes :

> *« Refunds can only be initiated for orders that are in a **completed** state.
> Orders in any other state are not eligible for refunds. »*

> `capture_mode: automatic` — *« The order is captured automatically after
> payment authorisation. No further actions are needed. »*

> `capture_mode: manual` — *« The order is not captured automatically and stays
> in **authorised** state. »*

> *« By default, uncaptured orders with final authorisation remain in
> **authorised** state for 7 days. **If not captured within this period, the
> funds are returned to the customer's original payment method.** »*

Et l'exemple de capture renvoie `state: "completed"` sur l'ordre,
`state: "captured"` sur le paiement — le même paiement qui porte `fees[]` et
`settled_amount`.

### La règle qui en découle, et elle ne se discute pas

| État | Ce qu'il vaut | Ce qu'on fait |
|---|---|---|
| `pending` | rien | on attend |
| `authorised` | **réversible** — les fonds repartent au client sous 7 jours si non capturé | ⛔ **on n'expédie RIEN** |
| `processing` | en cours | on attend |
| `completed` | remboursable, donc encaissé | ✅ **c'est là qu'on agit** |

**On traite `ORDER_COMPLETED`. Jamais `ORDER_AUTHORISED`.** Notre `capture_mode`
sera `automatic` (le défaut), donc la capture est immédiate et cette distinction
ne devrait jamais poser problème — mais elle est écrite ici pour que personne ne
« simplifie » un jour en écoutant l'événement le plus précoce.

`ORDER_AUTHORISED` reste utile à journaliser : il donne une trace de tentative,
sans jamais déclencher d'expédition ni de facture.

⚠️ **Réserve** : la liste exhaustive des états intermédiaires n'a pas été lue.
Le bac à sable la révélera, et un état inconnu doit être **journalisé et
ignoré**, jamais traité comme un succès. C'est une règle d'implémentation, pas
une supposition.

## 4.4 🟡 Limites de `metadata`
Cherché dans « Create an order » — non précisé.

Nombre de clés, longueur d'une valeur, longueur d'une clé. `stripe-meta.js`
découpe en tranches de 450 caractères **pour tenir les limites Stripe**. Si
Revolut est plus large, le découpage disparaît ; s'il est plus étroit, il faut
le réécrire. On ne devine pas : on lit.

## 4.5 ✅ RÉSOLU le 31/07/2026 — clés API et bac à sable

Fourni par l'user (page *Merchant → Get started*) :

| | |
|---|---|
| API bac à sable | `sandbox-merchant.revolut.com/` |
| API production | `merchant.revolut.com/api` |
| Clé **publique** | côté client, avec les moyens de paiement au checkout |
| Clé **secrète** | en-tête `Authorization` de tous les appels serveur |
| Où les générer | Revolut Business → Merchant overview → Merchant API → *Generate* |

⚠️ *« Use Production keys only in the production environment. »* Les deux jeux
ne sont pas interchangeables. Sur Vercel, deux variables distinctes, et
l'environnement du widget doit correspondre à celui où l'ordre a été créé —
*« The order must be created in the same environment where the widget is
loaded. »* Un ordre créé en production affiché dans un widget bac à sable ne
marchera pas, et le message d'erreur ne le dira pas clairement.

✅ **Bonne nouvelle** : *« To try the Merchant API in a test environment without
signing up for a real Revolut Business and Merchant account, create a Revolut
Sandbox account. »* Les étapes 2, 3 et 5 peuvent donc être développées **et
testées** avant même que l'entreprise existe.

## 4.6 🟠 La commission entre dans le CALCUL DES PRIX — et elle y est en dur

**Ce n'est pas un point de comptabilité, c'est un point de prix.** Mesuré :

```
$ grep -n "stripe" api/_lib/pricing-model.js
25:  stripePct: 0.015,
26:  stripeFix: 0.25,
86:  var stripe = ttc * cfg.stripePct + cfg.stripeFix;
88:  var costs = costHT + ship + octroiPaid + stripe + …
```

Tous les prix affichés sur le site sont calculés en supposant **1,5 % + 0,25 €**
de commission. L'user annonce pour Revolut une fourchette allant jusqu'à **2,8 %
sur les cartes internationales**.

Impact mesuré (coût neutre 200 € HT, port 20 €, markup 45 %, Guadeloupe) :

```
Stripe (hypothèse actuelle)     commission 5,42 €  net après IS 58,00 €  marge 18,3 %
Revolut carte EEE               commission 2,78 €  net après IS 60,24 €  marge 19,0 %
Revolut carte internationale    commission 9,67 €  net après IS 54,39 €  marge 17,1 %
```

### ✅ TRANCHÉ le 31/07/2026 — la grille réelle, et la surprise qu'elle contient

Grille Revolut Business France, **paiements en ligne** (relevée par l'user) :

| Moyen | Taux |
|---|---|
| Visa/Mastercard — conso nationales et européennes | **1,0 % + 0,20 €** |
| Visa/Mastercard — **cartes COMMERCIALES nationales** | **2,8 % + 0,20 €** |
| Visa/Mastercard — toutes cartes internationales | 2,8 % + 0,20 € |
| Amex — conso nationales | 1,7 % + 0,20 € |
| Amex — commerciales / internationales | 2,8 % + 0,20 € |
| Revolut Pay personnel | 1,0 % + 0,20 € |
| Virement Open Banking | 1,0 % + 0,20 € (plafonné à 5 €) |
| Rétrofacturation contestée | **15 €** |

⚠️ **Le « 0,8 % + 0,02 € » de la page d'accueil est le tarif EN PERSONNE.** Le
minimum en ligne est 1,0 % + 0,20 €.

⛔ **LA SURPRISE : la carte COMMERCIALE NATIONALE est au même taux que
l'internationale — 2,8 %.** Toute la discussion portait sur les cartes
internationales, dont l'user disait à raison qu'aucun artisan guadeloupéen n'en
a. Mais une **carte professionnelle**, c'est exactement ce qu'un artisan sort
pour acheter son outillage. Le cas « rare » ne l'est pas du tout.

**Décision retenue : 2,8 % + 0,20 €**, le plus haut de la grille classique.
Appliqué dans `api/_lib/pricing-model.js`.

Coût de l'erreur qu'on évite, mesuré (200 € HT, port 20 €, markup 45 %,
Guadeloupe) : un prix calculé sur 1,5 % prévoit **5,42 €** de commission ; une
carte commerciale en prélève **9,85 €**. **4,43 € par vente**, invisibles
jusqu'au relevé.

**La comptabilité, elle, n'a aucun chiffre en dur** : elle lit la commission
réelle dans `payments[].fees[]`. Quel que soit le taux choisi pour le calcul des
prix, le compte de résultat restera exact.

## 4.6 bis ⛔ SURCOÛT « CARTE INTERNATIONALE » — INTERDIT EN FRANCE

**Demande de l'user (31/07/2026)** : détecter une carte internationale à la
saisie, afficher « une commission de 2,8 % s'applique », et la facturer.

**Ce n'est pas faisable légalement.** Ce n'est pas une objection technique.

> **Code monétaire et financier, article L112-12** — le bénéficiaire d'un
> paiement **ne peut pas appliquer de frais pour l'usage d'un instrument de
> paiement donné**. Une dérogation n'est possible que dans des conditions
> fixées par décret.
>
> Sanctions administratives relevées : jusqu'à **3 000 €** (personne physique)
> et **15 000 €** (personne morale). La **DGCCRF** contrôle spécifiquement
> l'application de cette interdiction chez les commerçants.

⚠️ **Sourcé mais non lu à la source** : `legifrance.gouv.fr` et
`economie.gouv.fr` répondent **403** depuis l'environnement de travail. Les
éléments ci-dessus viennent d'un index de moteur de recherche portant sur ces
deux sites — numéro d'article, teneur de l'interdiction, montants des amendes et
autorité de contrôle concordent. **À confirmer sur legifrance avant toute
décision définitive**, mais le risque est trop net pour construire dessus.

⚠️ Le texte français ne distingue **pas** l'origine de la carte. La directive
européenne DSP2 laisse une porte entrouverte pour les cartes émises hors EEE ;
le texte français, lui, vise « un instrument de paiement donné » sans réserve.
Miser sur cette porte, c'est parier contre la DGCCRF.

### Ce que la loi autorise, en revanche

La même section du code prévoit expressément le sens inverse : *« lorsque le
bénéficiaire propose une **réduction** au payeur pour l'usage d'un instrument
donné, il doit l'en informer avant d'initier l'opération »*. Une **remise** est
légale ; un **surcoût** ne l'est pas.

⛔ Mais afficher tous les prix à +2,8 % pour « offrir une remise » aux cartes
européennes serait le même surcoût déguisé, et ça heurterait D-004 (pas de prix
de référence artificiel). **Écarté.**

### La solution retenue — et elle sert le même objectif

1. **Un seul prix pour tout le monde**, calculé avec un taux unique dans
   `pricing-model.js`.
2. **Ce taux se choisit sur des données réelles, pas sur une intuition.** Chaque
   vente enregistre déjà la commission exacte (`payments[].fees[]`). On ajoute
   au panneau comptabilité le **taux de commission réellement constaté** et la
   **part des ventes par carte hors EEE**.
3. Si cette part devient matérielle, le taux du modèle se relève d'un cran —
   une décision de prix, prise sur des chiffres, appliquée à tous, légale.

L'user l'a dit lui-même : *« personne ne paye avec une carte internationale en
Guadeloupe »*. Le risque est donc rare **et mesuré**, au lieu d'être rare et
sanctionnable.

### Ce qui reste vrai de son intuition

Informer le client de ce qu'il paie est une **obligation** (information
précontractuelle), et le site la respecte déjà : le montant affiché est le
montant débité, aligné au centime par `check-prix-affiches`. Rien à ajouter à
l'écran de paiement — ce serait afficher un frais qui n'existe pas.

## 4.7 🟡 Commission en cas de remboursement — À MOITIÉ résolu

La page tarifs dit : *« Remboursements — Traitez les remboursements rapidement,
**sans frais supplémentaires**. »*

⚠️ **Cela répond à une autre question que la nôtre.** « Sans frais
supplémentaires » signifie que **rembourser ne coûte rien de plus**. Ça ne dit
PAS si la commission d'encaissement **initiale** est restituée. Ce sont deux
choses différentes, et c'est la seconde qui alimente `stripeFeeRendu`.

On garde donc **0 par défaut** — l'hypothèse la plus défavorable — et l'user
saisit ce que son relevé montre au premier remboursement réel. Un seul
remboursement tranchera la question mieux que n'importe quelle page.

À noter au passage, tiré de la même grille : une **rétrofacturation contestée
coûte 15 €**. Ce n'est ni une charge de la catégorie « banque » ni un
remboursement : c'est une ligne à part, à saisir en charge quand elle arrive.

---

## Plus rien ne bloque l'écriture

État au 31/07/2026, après la lecture des types du paquet npm :

| | |
|---|---|
| Signature webhook | ✅ vérifiée sur vecteur officiel |
| État « argent acquis » | ✅ tranché (`ORDER_COMPLETED`) |
| Widget | ✅ contrat lu dans le paquet livré |
| Commission réelle | ✅ `payments[].fees[]` |
| Remboursement | ✅ endpoint + `Idempotency-Key` |

Les inconnues restantes ne bloquent plus, et voici pourquoi :

| Inconnue | Pourquoi ça n'arrête pas l'écriture |
|---|---|
| Limites de `metadata` | on garde le découpage actuel (450 car.). Plus permissif → sans effet ; plus strict → le bac à sable le dit tout de suite |
| Hôte API du bac à sable | nécessaire pour **tester**, pas pour écrire. Arrive avec les clés |
| Politique de re-livraison | on construit le rattrapage par réconciliation **dans tous les cas** — strictement plus sûr, quelle que soit la réponse |
| Taux de commission | ce n'est pas une constante à deviner : c'est un **réglage** que l'user saisit (voir §4.6) |

**Décision de l'user, 31/07/2026** : on retient **le taux le plus haut de la
grille classique**, pas les 2,8 % des cartes internationales — *« aucun artisan
ne possède une carte internationale, ou alors il ne paie pas avec »*. Le
surcoût éventuel est assumé et rare.

**Il manque donc UN chiffre, pas un document** : la valeur exacte du taux le
plus haut de la grille classique, plus le fixe par transaction. L'user l'a sous
les yeux dans son espace Revolut.

Prochaine étape : **l'étape 1, la couture**. Elle ne dépend d'aucune inconnue.
