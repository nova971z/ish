# REGISTRE DES LEÇONS — une panne, une porte

> **Une leçon sans dent est une anecdote.** Chaque ligne doit nommer le fichier
> qui la fait respecter, et `scripts/check-lecons.js` vérifie que ce fichier
> **existe** — sinon la CI rougit.
>
> Il ne juge pas si la porte est bonne : ça, c'est le **sabotage** qui le prouve.
> Il vérifie qu'elle existe. C'est le minimum, et c'est mécanique.

**Format** — quatre colonnes, sans exception :
`| date | ce qui a cassé | la cause | la porte qui l'empêche |`

---

## Leçons du 29/07/2026

| Date | Ce qui a cassé | La cause | La porte |
|---|---|---|---|
| 29/07/2026 | Site entièrement mort sur le domaine, chargement sans fin, aucun bouton | Le dernier recours du Service Worker redirigeait la page vers elle-même | `tests/sw-navigation.mjs` |
| 29/07/2026 | Écran noir possible si le démarrage échoue | Rien ne vérifiait que le watchdog inline se déclenche vraiment | `tests/boot-resilience.mjs` |
| 29/07/2026 | 4 captures d'écran des espaces client et livreur servies **publiquement** | Des harnais écrivaient leurs images à la racine du site, versionnées | `scripts/check-harnais.js` |
| 29/07/2026 | Le lanceur de tests annonçait +1 assertion par harnais | Sa propre ligne de bilan était comptée comme une assertion | `tests/lancer.mjs` |
| 29/07/2026 | La clé TOTP sortait de l'écran de l'iPad | Réutilisation d'un style taillé pour un code à 6 chiffres | `tests/mfa-cle-largeur.mjs` |
| 29/07/2026 | La voie du claim admin était **inatteignable** : retirer `ADMIN_SECRET` aurait verrouillé l'administration | La porte de l'interface ne regardait que le secret local, sans jamais interroger le serveur | `.claude/rules/donnees.md` |
| 29/07/2026 | Un droit d'accès admin aurait survécu à une déconnexion | Drapeau d'état non réinitialisé au changement de compte | `scripts/audit/p7-architecture.js` |
| 29/07/2026 | `CLAUDE.md` avait atteint 1 552 lignes, 79 règles noyées dedans | Rien n'empêchait d'y écrire | `scripts/check-memoire.js` |
| 29/07/2026 | L'entonnoir `ou.js` pouvait envoyer vers des fonctions renommées | Son index est le seul élément écrit à la main | `scripts/check-ou.js` |
| 29/07/2026 | `ou.js` construit le matin, utilisé **zéro fois** de la journée | Un protocole qu'on peut oublier est un vœu | `scripts/garde-entonnoir.js` |
| 29/07/2026 | Plafond d'`app.js` bloquant un correctif de sécurité | Le fichier était à 29 octets de sa limite | `D-014` |
| 29/07/2026 | Le domaine ne répondait plus depuis le Maroc | Migration vers des IP Vercel injoignables depuis cet opérateur | `D-013` |
| 29/07/2026 | 20 erreurs répétées sans qu'aucune trace ne dise **d'où** elles venaient | Rien ne classait les fautes par mécanisme : chacune semblait isolée, donc imprévisible | `scripts/erreurs.js` |
| 29/07/2026 | Prix, statut des livreurs et données personnelles éditables sans jamais lire ce qu'ils engagent | Le filet ne couvrait que le bogue ; l'infraction ne se manifeste pas à l'exécution | `scripts/juridique.js` |
| 29/07/2026 | Un sabotage cru annulé restait en place : `git checkout` sur un fichier non suivi, échec avalé par un `ou-vrai` de complaisance | La restauration est un instrument comme un autre, et il n'était pas relu | `docs/ERREURS.md` |

---

## Comment on s'en sert

1. Une panne survient → on la corrige.
2. **On écrit la ligne ici** : ce qui a cassé, la cause, la porte.
3. **La porte doit exister** — sinon la CI refuse la livraison.
4. **La porte doit être prouvée faillible** : on réintroduit le défaut, elle rougit.

⛔ Une leçon dont la colonne « porte » est vide n'est pas acceptée. Si la
protection n'existe pas encore, on l'écrit **avant** de clore la panne — ou on
dit explicitement qu'elle reste non protégée, et pourquoi.
