# ÉTAT DU TABLEAU DE BORD VERCEL — faits vérifiés par capture

> Ce fichier enregistre ce que Killian a VÉRIFIÉ de ses yeux sur le dashboard
> Vercel (que ma session ne peut pas voir). ⛔ Un fait gravé ici ne se
> redemande JAMAIS — on le relit.

| Fait | État | Vérifié le | Preuve |
|---|---|---|---|
| `WATCH_SECRET` (auth traqueur) | **PRÉSENT** (Production + Preview, ajouté 31/07) | 08/08/2026 soir | capture Environment Variables |
| `ADMIN_SECRET` (secret rejouable) | **ABSENT** — supprimé ~05/08 | 08/08/2026 soir | capture Environment Variables (n'y figure plus) |
| `FIREBASE_SERVICE_ACCOUNT` | présent (Production + Preview) | 08/08/2026 soir | capture Environment Variables |
| Build Production `f651fc0` (fix vercel.json) | **READY 1m22s** — la prod sert enfin tous les lots depuis 6fabaf7 | 09/08/2026 09:04 | capture Deployments |
| `VERCEL_TOKEN` | **PAS ENCORE posé** — nécessaire pour que ma session lise l'état des builds | — | voir procédure ci-dessous |

Conséquences en vigueur :
- l'audit SE-002/SE-003 (« vérifier qu'ADMIN_SECRET est supprimé ») est **CLOS** ;
- le repli legacy `requireWatch` sur ADMIN_SECRET est mort en pratique (variable absente) ;
- ma session ne joint NI `api.vercel.com` NI `pirates-tools.com` (mandataire réseau : CONNECT 403
  mesuré le 09/08). Tant que l'accès n'est pas ouvert, `verifier-pousse` rend ROUGE sur l'étape
  build — c'est VOULU : le rapport dit « poussé, build non prouvé », jamais « déployé ».

## Procédure VERCEL_TOKEN (3 étapes, une seule fois)

1. **Créer le jeton** : vercel.com → avatar (en bas à gauche) → *Account Settings* →
   *Tokens* → *Create* — nom `pirates-tools-verif`, scope le compte, expiration 1 an → **copier**.
2. **Le poser + ouvrir le réseau** : dans Claude Code (code.claude.com) → réglages de
   l'ENVIRONNEMENT de ces sessions → (a) variables d'environnement : ajouter
   `VERCEL_TOKEN` = la valeur copiée ; (b) politique réseau : autoriser les domaines
   `api.vercel.com` **et** `pirates-tools.com`. Le jeton ne passe JAMAIS par git ni par le chat.
3. **Prouver** : dans une nouvelle session, dire « vérifie le déploiement » →
   `node outils/verifier-pousse.mjs` doit rendre `✅ BUILD PROUVÉ`. Premier run vert = procédure close.
