# Search Console — mode d'emploi pas à pas (depuis ton iPad)

*Durée : ~10 minutes + un délai DNS qui peut prendre jusqu'à quelques heures.
Rien ici ne dépend de la création d'entreprise.*

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

## Étape 3 — La vérification DNS
1. Google affiche un **enregistrement TXT** à copier, de la forme
   `google-site-verification=XXXXXXXX`. Copie-le.
2. Ouvre l'interface de gestion DNS **chez le registrar où tu as acheté
   pirates-tools.com** (là où tu gères déjà le domaine pour Vercel).
3. Ajoute un enregistrement :
   - **Type** : TXT
   - **Nom / hôte** : `@` (ou vide, selon l'interface — ça veut dire « le
     domaine lui-même »)
   - **Valeur** : la chaîne copiée à l'étape 1
   - **TTL** : laisse la valeur proposée.
4. Enregistre, retourne dans Search Console, bouton **« Vérifier »**.
   - Si ça échoue : attends 1 à 2 heures (propagation DNS) et re-clique
     « Vérifier ». L'enregistrement TXT ne gêne rien, tu peux le laisser
     pour toujours (Google re-vérifie périodiquement — ne le supprime pas).

## Étape 4 — Soumettre le sitemap
1. Dans le menu de gauche : **« Sitemaps »**.
2. Champ « Ajouter un sitemap » : tape `sitemap.xml` → **Envoyer**.
3. ⚠️ Aujourd'hui ce sitemap ne déclare qu'UNE URL — c'est normal, c'est
   l'état mesuré par l'audit. Dès que l'ordre 3 du plan sera livré
   (sitemap généré), le même fichier portera toutes les pages éligibles et
   Google le relira tout seul : **rien à refaire de ton côté**.

## Étape 5 — Pendant que tu y es : les redirections (Q-02)
1. Dans Safari, ouvre `http://www.pirates-tools.com` → note ce que devient
   l'URL dans la barre.
2. Ouvre `https://ish-ebon.vercel.app` → pareil.
3. Les deux doivent finir sur `https://pirates-tools.com/…`. Si l'une reste
   sur son adresse d'origine, dis-le-moi : j'ajouterai la redirection dans
   la configuration Vercel.

## Ce que tu verras ensuite (à quoi ça sert)
- **Pages** : combien de pages Google connaît / indexe — c'est LE compteur
  du chantier SEO.
- **Performances** : sur quels mots les gens te trouvent (« outillage
  Guadeloupe »…), combien cliquent.
- **Ne t'inquiète pas** des avertissements les premières semaines : tant que
  les ordres 1-3 ne sont pas livrés, Google ne voit qu'une page — c'est
  attendu.
