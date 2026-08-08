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

## V2 — ce qui a changé depuis la V1 (revue de Killian, 08/08)
1. **Couverture totale** : les 16 constats SEO-026 à SEO-041 sont intégrés au plan — vérifié par script : 36 IDs P0/P1/P2, 36 couverts, 0 orphelin.
2. **Règle anti thin content gravée** (ordre 0, appliquée aux ordres 2, 3 et 7) : fiche indexable UNIQUEMENT si description_long non vide ET photo réelle, sinon noindex,follow — la levée est pilotée par le compteur CI de D-54.
3. **Vrai 404 serveur** (ordre 1) : slug inconnu → HTTP 404 + noindex, critère curl explicite — et le défaut jumeau du routeur client (SEO-027) est corrigé au même ordre.
4. **SEO-005 reformulé** : « api/render.js (absent) » — le répertoire api/ existe bel et bien.
5. **Complément d audit mesuré** : SEO-042 (formats réels : 315 WebP 62,39 Mo moyenne 203 Ko, 0 AVIF, le poids vient de 6 heroes 638-871 Ko) et SEO-043 (lazy/decoding déjà en place — BON).
6. **plan_correctifs_p0.csv créé** : les 5 P0 fonctionnels du module courses (CODE-093/094/128/129/130) + 2 P1 voisins, à exécuter AVANT le chantier SEO — le module est en service (routes mesurées dans app.js). Garde-fou D-009 inclus : aucun changement de barème ni de flux d argent.
7. **Décision NAP** : OnlineStore + areaServed conservés, AUCUNE adresse inventée — gravé dans docs/DECISIONS.md (D-019) avec les trois choix d architecture.

## Questions restantes pour Killian
1. Search Console : la propriété pirates-tools.com est-elle déclarée ?
2. Depuis un navigateur : www.pirates-tools.com et ish-ebon.vercel.app redirigent-ils en 301 vers https://pirates-tools.com ?
3. Garantie affichée sur les fiches : quelle durée t engage ? (déjà posé au message du nettoyeur.)
4. Les 6 heroes lourds (posters *-hero.webp, 638-871 Ko) sont des rendus 3D internes : feu vert pour les réencoder plus légers ? (Tes visuels à toi ne sont jamais touchés.)
