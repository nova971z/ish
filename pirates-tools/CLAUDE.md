
## 🔐 ADRESSE E-MAIL VÉRIFIÉE EXIGÉE (28/07/2026, SW v532) — étape 1/2
Décision user : **e-mail + Google Authenticator, PAS de SMS** (« gratuit pour
50 000 comptes, ça nous laisse une marge très large »).
### Ce qui existait déjà
`sendEmailVerification` était **déjà** appelé à l'inscription, et un bandeau
`#accVerifyBanner` + un bouton de renvoi existaient. Il manquait **le blocage** :
`verifyUid` ne lisait pas `email_verified`, donc rien n'était exigé.
### Ce qui a été fait
- `verifyIdentity(req)` (api/_lib/firebase.js) renvoie `{uid, email,
  emailVerified}` depuis la revendication **signée** `email_verified` — le
  client ne peut pas la falsifier, contrairement à un champ du corps.
  `verifyUid` est conservé (rétrocompatibilité) et délègue.
- `EXIGE_EMAIL_VERIFIE = {course-request, courier-apply}` dans contact.js →
  **403 `code:'email-non-verifie'`** avec un message qui dit quoi faire.
- ⚠️ **PÉRIMÈTRE VOLONTAIREMENT ÉTROIT** : la LECTURE (`course-list`,
  `courier-status`, `conv-list`) et les actions d'une course DÉJÀ ENGAGÉE
  (`course-accord-accept`, `course-cancel`, `course-release`) ne sont PAS
  bloquées. Coincer quelqu'un au milieu d'un parcours ne protège personne.
- ⚠️ **LE PIÈGE DU JETON PÉRIMÉ** : `email_verified` n'est mis à jour dans le
  jeton qu'au renouvellement (**1 h**) ou sur `getIdToken(true)`. Sans
  traitement, l'utilisateur qui vient de cliquer le lien resterait refusé une
  heure. → `jsonAuthHeaders(force)` + `lvEmailNonVerifie()` qui recharge
  l'utilisateur, force un jeton neuf et renvoie vers Mon compte.
- VÉRIFIÉ : **20/20 plan12-serveur** (dont « la lecture n'est PAS bloquée » et
  « 401 ≠ 403 »). 2 sabotages : blocage retiré, blocage trop zélé étendu à la
  lecture — les deux détectés.
  ⚠️ PIÈGE DE HARNAIS : sans `RESEND_API_KEY`/`OWNER_EMAIL`, contact.js répond
  503 AVANT tout contrôle et les tests « pas bloqué » passaient pour la
  MAUVAISE raison (faux vert). Variables posées + assertion explicite
  `aFranchiLeControle()`.
  ⚠️ Tout harnais qui stubbe `_lib/firebase` doit désormais fournir
  `verifyIdentity` (accordE2E.mjs mis à jour).
### ⏭️ ÉTAPE 2 — TOTP (Google Authenticator) : BLOQUÉE SUR ACTION USER
Le TOTP n'existe PAS dans Firebase Auth standard : il exige **Identity
Platform** (upgrade gratuit du projet, jusqu'à 50 000 comptes actifs).
Tant que ce n'est pas activé, `multiFactor(...).enroll()` avec TOTP n'est pas
disponible dans le SDK — impossible à coder à l'aveugle.
PROCÉDURE : console Firebase → Authentication → Settings → « Upgrade to
Identity Platform », puis Authentication → Sign-in method → activer
**Multi-factor / TOTP**. Prévenir dès que c'est fait.
PRIORITÉ RAPPELÉE À L'USER : le compte **ADMIN** en a plus besoin que les
clients (un admin piraté expose les données de tous).
