
## 🔔 FLUIDITÉ & VÉRITÉ DE L'AFFICHAGE (28/07/2026, SW v530)
Cinq retours, tous tracés dans le code AVANT correction.
### P1 — Le bandeau vert ne s'actualisait JAMAIS
« il ne s'affiche que sur la page du livreur, ou alors il met beaucoup de temps ».
Il était bien posé sur toutes les pages, mais chargé **UNE SEULE FOIS**, au
verdict d'authentification : une course déposée après l'ouverture n'apparaissait
jamais. → `lvAlertPlanifier()` : sondage **45 s** (~80 req/h, plafond 400
lectures/h/uid), **rien quand l'onglet est caché**, une seule minuterie.
- ⚠️ PIÈGE ANTICIPÉ : si le sondage tombe pendant que le livreur LIT les
  détails dépliés, `lvAlertMaj` les refermait sous ses yeux. Garde ajoutée :
  `if (e.det && !e.det.hidden) return;`.
### P2 — Aucun vrai livreur n'était prévenu
`alertNewCourse` n'écrivait qu'aux `TEST_EMAILS` + owner. → `destinatairesLivreurs(db)`
lit `couriers` où `kycStatus === 'valide'` (plafond 50) et alerte par email.
⚠️ Les 3 appels (`course-request`, `course-create`, webhook) passent désormais `db`.
- **SMS** : aucun fournisseur n'existait. `sendSms()` (Twilio, HTTP + Basic auth,
  zéro dépendance) est écrit mais **TOTALEMENT INERTE** sans
  `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` — prouvé : 0 appel
  réseau sans clé. `telE164` normalise (0690… → +590690…) et REFUSE tout ce qui
  n'est pas un vrai numéro. ⚠️ ACTION USER pour activer : créer un compte
  Twilio, acheter un numéro, poser les 3 variables sur Vercel.
### P3 — Le livreur ne pouvait plus toucher à son prix
Le serveur l'autorisait DÉJÀ (il ne refuse qu'un accord **validé**) — seul
l'écran ne l'offrait pas. Champ + « 💶 Mettre à jour mon prix » tant que le
client n'a pas accepté ; plus rien une fois validé.
### P4 — L'historique mentait
`'✅ Par toi'` s'affichait dès que la course était à moi : **annulée et terminée
se lisaient à l'identique**. → `lvStatutCourt` / `lvStatutClasse` (mot +
couleur). Défaut RÉEL, pas un artefact du compte de test.
### P5 — L'annuaire disparaissait de l'accueil
`loadCouriers`/`loadPartners` résolvaient `[]` **en cas d'échec réseau**, et
l'appelant masquait la section. → `_couriersDernier`/`_partnersDernier` :
dernier succès resservi. **ÉCHEC ≠ VIDE** (5e occurrence de ce motif ici).
### P6 — On ne distinguait plus qui écrit
Le CSS était déjà juste (violet à droite / gris à gauche). Le rôle venait de
`c.mine` SEUL : sur un compte qui joue les DEUX côtés, `mine` ET `acceptedByMe`
sont vrais → la bulle le prenait toujours pour le client. → sélecteur
« J'écris en tant que » **affiché uniquement si `mine && acceptedByMe`**.
- VÉRIFIÉ : **27/27 plan11** + **17/17 plan11-serveur** + 32/32 plan10 + 70/70
  plan9 + 31/31 plan9-serveur + 70/70 plan8 + 82/82 couriers + 18/18 accordE2E
  + 129 autres. CI verte. **6 sabotages** (sondage retiré, détails refermés,
  retour du « Par toi », prix non modifiable, échec=vide, SMS sans clé) : tous
  détectés.
- ⚠️ Budget P8 atteint DEUX fois (app.js 205 Ko, styles.css 60 Ko) : plafonds
  NON relevés — commentaires condensés + 9 règles CSS mortes vérifiées
  (`toast__icon/body/close` : `toast()` n'émet que `toast toast--type`).
