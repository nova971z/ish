# Mémoire projet — Pirates Tools (e-commerce PWA)

Travail actif : `pirates-tools/` (PWA vanilla HTML/CSS/JS, API serverless Vercel + Firebase + Stripe).
Branche de dev : `claude/pirates-tools-rebuild-zWc1b`. Prod = Vercel (`ish-ebon.vercel.app`).

## Exigence qualité (non négociable)
Code de niveau ingénieur web senior, standard des grandes institutions e-commerce.
Aucun hasard, aucun bullshit. Chaque correction est vérifiée dans le code avant d'être livrée.

## Plan de remédiation en cours
Document maître : `pirates-tools/docs/PLAN-REMEDIATION.md` (10 étapes, versionné).
Ordre non négociable : argent → sécurité → fonctionnel → structure → polish.
Règle : **1 étape = 1 problème = 1 commit = 1 vérification verte**. Jamais d'étape à moitié faite.

### Suivi des étapes
- [x] 1. Routeur : ajouter /admin /merci /contact /favoris à ROUTES (app.js:2753) ✅ commit, SW v290
       Note : cancel_url '#/checkout' (app.js:3876) pointe vers une route fantôme → à traiter étape 2 (le repointer vers #/devis).
- [ ] 2. Intégrité des prix (serveur recalcule ; affiché == débité)
- [ ] 3. Verrouiller API (auth orders.js, CORS allowlist, secret timing-safe)
- [ ] 4. Failles XSS (escapeHTML guillemets + openPayModal)
- [ ] 5. Cohérence déploiement (Vercel prod, canonical, sitemap, CI master)
- [ ] 6. Webhook Stripe (raw body + idempotence)
- [ ] 7. Bugs Service Worker (empoisonnement cache, fallback offline)
- [ ] 8. Bugs runtime app.js (starBtns, storage guards, confirmPayment catch, NOWPayments)
- [ ] 9. Assainir CSS/HTML (fork inline, CSS mort, z-index, h1)
- [ ] 10. Qualité structurelle & CI (helpers partagés, carte produit unique, docs)

## Vérification standard
`cd pirates-tools && node scripts/ci.js` doit rester vert après chaque étape.
Bump SW (`sw.js` VERSION + ASSET_VER) et `?v=` dans `index.html` à chaque changement d'asset.

## Rappels techniques
- app.js = un seul IIFE (~6172 lignes), style ES5 var/function.
- Cache-busting : VERSION + ASSET_VER + ?v= doivent être alignés.
- Ne jamais commiter de secret serveur côté client (clés publishable Stripe OK).
