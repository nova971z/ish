# Audit SEO Pirates Tools — 08/08/2026

## Fichiers

| Fichier | Contenu |
|---|---|
| `_progress.md` | Les 764 fichiers du dépôt, une case par fichier — source de vérité de l'avancement. Reprise : premier fichier non coché. |
| `audit_seo.csv` | Constats SEO. Colonnes : ID;Fichier;Lignes;Categorie;Severite;Constat;Preuve;Recommandation;Impact_SEO;Effort |
| `backlog_code.csv` | Qualité de code hors SEO (BON/MOYEN/BAS). À corriger PLUS TARD, rien maintenant. |
| `plan_action_seo.csv` | Le plan, trié impact Guadeloupe d'abord. Chaque action référence ses IDs d'audit. |
| `_verifier.js` | Le contrôleur : chaque constat d'agent lecteur n'entre au backlog QUE si son extrait existe à la ligne annoncée (±3) dans la source. |
| `_ok_*.jsonl` / `_ko_*.jsonl` | Traçabilité : constats vérifiés / disqualifiés par lecteur. |

## Méthode
- Mode lecture seule : AUCUN fichier source modifié.
- Chaque constat porte fichier + ligne + preuve (commande ou extrait vérifié).
- Deux prémisses de la mission étaient fausses, vérifiées à la source :
  le site n'est PAS en React/Vite (`package.json` : zéro dépendance front,
  aucun build) et la plateforme n'est PAS Cloudflare Pages (`vercel.json`
  présent, zéro fichier wrangler). Le plan raisonne sur le réel : Vercel,
  JavaScript pur.
- La production n'est pas joignable depuis cet environnement
  (`curl https://pirates-tools.com` → 403 du proxy) : les points qui exigent
  la prod réelle sont marqués EXTERNE, jamais devinés.

## Questions ouvertes pour Killian (bloquantes pour certaines actions)
1. **NAP** : adresse postale et téléphone officiels de l'entreprise en
   Guadeloupe (pour le JSON-LD LocalBusiness — action 5 du plan).
2. **Google Business Profile** : existe-t-il déjà ? Sous quel nom ?
3. **Search Console** : la propriété pirates-tools.com est-elle déclarée ?
4. **Domaine** : depuis un navigateur, vérifier que `www.pirates-tools.com`
   et `ish-ebon.vercel.app` redirigent (301) vers `https://pirates-tools.com`
   — invérifiable depuis le dépôt.
5. **Garantie** affichée sur les fiches : quelle durée t'engage ? (déjà posé
   au message du nettoyeur.)
