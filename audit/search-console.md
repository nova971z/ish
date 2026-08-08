# Search Console — mode d'emploi pas à pas (depuis ton iPad, domaine chez Cloudflare)

*Durée : ~10 minutes. Chez Cloudflare la propagation DNS est en général
de quelques minutes. Rien ici ne dépend de la création d'entreprise.*

## Étape 1 — Ouvrir Search Console
1. Va sur `search.google.com/search-console` et connecte-toi avec le compte
   Google que tu veux garder comme propriétaire du site (celui que tu ne
   perdras pas).
2. Bouton **« Ajouter une propriété »**.

## Étape 2 — Choisir le type « Domaine »
1. Deux choix s'affichent : prends **« Domaine »** (colonne de gauche), pas
   « Préfixe d'URL ». Le type Domaine couvre d'un coup `https`, `http`,
   `www` et l'apex — une seule vérification pour tout.
2. Tape : `pirates-tools.com` (sans https, sans www) → **Continuer**.

## Étape 3 — La vérification DNS, dans Cloudflare
1. Google affiche un **enregistrement TXT** à copier, de la forme
   `google-site-verification=XXXXXXXX`. Copie-le (bouton copier).
2. Dans un autre onglet : `dash.cloudflare.com` → connecte-toi → clique le
   domaine **pirates-tools.com**.
3. Menu de gauche : **DNS** → **Records** (« Enregistrements »).
4. Bouton **« Add record »** (« Ajouter un enregistrement ») :
   - **Type** : `TXT`
   - **Name** (nom) : `@` — Cloudflare l'affichera comme `pirates-tools.com`
   - **Content** (contenu) : colle la chaîne `google-site-verification=…`
   - **TTL** : laisse `Auto`.
   - ⚠️ Il n'y a **pas de nuage orange/gris** sur un TXT : c'est normal, le
     proxy Cloudflare ne concerne pas ce type d'enregistrement.
5. **Save**, retourne dans l'onglet Search Console, bouton **« Vérifier »**.
   - Si ça échoue : attends 5 à 10 minutes et re-clique « Vérifier »
     (Cloudflare propage vite, mais Google met parfois quelques minutes à
     relire). L'enregistrement TXT ne gêne rien : **laisse-le pour toujours**
     — Google re-vérifie périodiquement, le supprimer ferait perdre la
     propriété.

## Étape 4 — Soumettre le sitemap
1. Dans le menu de gauche de Search Console : **« Sitemaps »**.
2. Champ « Ajouter un sitemap » : tape `sitemap.xml` → **Envoyer**.
3. ⚠️ Tant que l'ordre 3 du plan n'est pas déployé, ce sitemap ne déclare
   qu'UNE URL — c'est l'état mesuré par l'audit, pas une erreur. Dès que le
   sitemap généré sera en ligne, le même fichier portera toutes les pages
   éligibles et Google le relira tout seul : **rien à refaire de ton côté**.

## Étape 5 — Pendant que tu y es : les redirections (Q-02)
1. Dans Safari, ouvre `http://www.pirates-tools.com` → note ce que devient
   l'URL dans la barre.
2. Ouvre `https://ish-ebon.vercel.app` → pareil.
3. Les deux doivent finir sur `https://pirates-tools.com/…`. Si l'une reste
   sur son adresse d'origine, dis-le-moi : j'ajouterai la redirection
   (règle Cloudflare ou configuration Vercel, selon la forme).

## Ce que tu verras ensuite (à quoi ça sert)
- **Pages** : combien de pages Google connaît / indexe — c'est LE compteur
  du chantier SEO.
- **Performances** : sur quels mots les gens te trouvent (« outillage
  Guadeloupe »…), combien cliquent.
- **Ne t'inquiète pas** des avertissements des premières semaines : tant que
  les ordres 1-3 ne sont pas déployés, Google ne voit qu'une page — c'est
  attendu.
