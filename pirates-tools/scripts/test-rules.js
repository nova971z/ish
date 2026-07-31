/* =========================================================
   test-rules.js — Tests des règles de sécurité Firestore (S1).

   Exécute la suite contre l'ÉMULATEUR Firestore (fidèle au moteur de règles
   de production). Ne PAS brancher à scripts/ci.js (nécessite l'émulateur +
   des dev-deps lourdes). Lancement :

     cd pirates-tools
     npx firebase emulators:exec --only firestore --project demo-pirates \
       "node scripts/test-rules.js"

   Vérifie qu'un client NE PEUT PAS accéder aux données d'un autre, forger une
   commande 'paid', ni toucher aux collections serveur.
   ========================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment, assertFails, assertSucceeds
} = require('@firebase/rules-unit-testing');
const {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, getDocs, query, where, setLogLevel
} = require('firebase/firestore');

setLogLevel('error'); // silence les avertissements SDK attendus (permission-denied)

const RULES = fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');

let passed = 0, failed = 0;
async function check(label, promise) {
  try { await promise; console.log('  ✅ ' + label); passed++; }
  catch (e) { console.error('  ❌ ' + label + ' — ' + (e && e.message)); failed++; }
}

(async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-pirates',
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 }
  });

  const alice = env.authenticatedContext('alice').firestore();
  const bob   = env.authenticatedContext('bob').firestore();
  const anon  = env.unauthenticatedContext().firestore();

  // Seed via contexte privilégié (contourne les règles) — état initial.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { name: 'Alice', email: 'a@x.fr', phone: '', address: '', avatar: '', loyalty: 0, createdAt: 1 });
    await setDoc(doc(db, 'users/bob'),   { name: 'Bob',   email: 'b@x.fr', phone: '', address: '', avatar: '', loyalty: 0, createdAt: 1 });
    await setDoc(doc(db, 'users/alice/orders/o1'), { status: 'quote', total: 10, items: 1, date: 1 });
    await setDoc(doc(db, 'payments/pay1'), { amountCents: 5000, uid: 'alice' });
    await setDoc(doc(db, 'product_overrides/p1'), { price: 100 });
    await setDoc(doc(db, 'stripe_events/e1'), { type: 'x' });
    await setDoc(doc(db, 'rate_limits/r1'), { count: 1 });
    await setDoc(doc(db, 'partners/artisan1'), { name: 'Menuiserie K', metier: 'Menuisier', tier: 'black', active: true, order: 1 });
    await setDoc(doc(db, 'partner_applications/app1'), { name: 'Candidat', metier: 'Plombier', tier: 'black', createdAt: 1 });
    await setDoc(doc(db, 'partners_private/artisan1'), { guest: true });
    await setDoc(doc(db, 'invite_codes/PT-TEST01'), { active: true, usedBy: '' });
    // Service coursier : fiche publique du livreur + course avec fil de discussion.
    await setDoc(doc(db, 'couriers_public/bob'), { uid: 'bob', displayName: 'Bob L.', published: true, available: true, coursesDone: 3, ratingCount: 1, ratingSum: 5, tarifs: { 1: 30 } });
    await setDoc(doc(db, 'couriers/bob'), { kycStatus: 'valide', email: 'b@x.fr' });
    // Collections serveur restantes (audit P4) : elles doivent TOUTES être
    // fermées au client, et chacune est desormais prouvee par une assertion.
    await setDoc(doc(db, 'charges/ch1'), { label: 'Assurance', amountCents: 12000 });
    await setDoc(doc(db, 'refunds/rf1'), { amountTtc: 108.5, territory: '971', avoirRef: 'AV-1' });
    await setDoc(doc(db, 'config/pricing'), { targetNet: 0.15 });
    await setDoc(doc(db, 'price_watch_log/run1'), { at: 1, changed: 3 });
    await setDoc(doc(db, 'courier_applications/bob'), { kyc: 'piece-identite' });
    await setDoc(doc(db, 'courier_locations/bob'), { lat: 16.2, lng: -61.5 });
    await setDoc(doc(db, 'courier_config/bareme'), { fuel: 1.87 });
    await setDoc(doc(db, 'analytics_clicks/dock'), { count: 42 });
    await setDoc(doc(db, 'analytics_events_recent/e1'), { type: 'view' });
    await setDoc(doc(db, 'courses/c1/photos/scene'), { data: 'data:image/jpeg;base64,AAA' });
    await setDoc(doc(db, 'courses/c1'), { artisanUid: 'alice', courierUid: 'bob', status: 'acceptee', code: '123456', round: 1 });
    await setDoc(doc(db, 'courses/c1/messages/m1'), { uid: 'alice', role: 'client', text: 'Bonjour', at: 1, round: 1 });
    await setDoc(doc(db, 'courses/c2'), { artisanUid: 'carol', courierUid: 'dave', status: 'acceptee', round: 1 });
    // DISCUSSION DIRECTE (hors course) : alice cliente ↔ bob livreur.
    await setDoc(doc(db, 'conversations/alice_bob'), {
      clientUid: 'alice', courierUid: 'bob', courierName: 'Bob', createdAt: 1
    });
    await setDoc(doc(db, 'conversations/alice_bob/messages/m1'), {
      uid: 'alice', role: 'client', text: 'Bonjour, tu es dispo ?', at: 1
    });
  });

  console.log('\n── Isolation entre clients ──');
  await check('Alice lit SON profil', assertSucceeds(getDoc(doc(alice, 'users/alice'))));
  await check('Alice NE lit PAS le profil de Bob', assertFails(getDoc(doc(alice, 'users/bob'))));
  await check('Alice NE lit PAS les commandes de Bob', assertFails(getDocs(collection(alice, 'users/bob/orders'))));
  await check('Anonyme NE lit PAS un profil', assertFails(getDoc(doc(anon, 'users/alice'))));
  await check('Anonyme NE lit PAS ses hypothétiques données', assertFails(getDoc(doc(anon, 'users/anon'))));

  console.log('\n── Profil : allowlist de champs ──');
  await check('Alice met à jour son profil (champs valides)', assertSucceeds(updateDoc(doc(alice, 'users/alice'), { phone: '0690', address: 'GP' })));
  await check('Alice NE peut PAS injecter un champ hors allowlist (role)', assertFails(updateDoc(doc(alice, 'users/alice'), { role: 'admin' })));
  await check('Alice NE peut PAS écrire le profil de Bob', assertFails(setDoc(doc(alice, 'users/bob'), { name: 'hack', email: '', phone: '', address: '', avatar: '', loyalty: 0, createdAt: 1 })));
  await check('Alice NE peut PAS supprimer le profil de Bob', assertFails(deleteDoc(doc(alice, 'users/bob'))));

  console.log('\n── Commandes : statut ──');
  await check('Alice crée une commande quote', assertSucceeds(addDoc(collection(alice, 'users/alice/orders'), { status: 'quote', total: 20, items: 1, date: 1 })));
  await check('Alice crée une commande pending (paiement carte initié)', assertSucceeds(addDoc(collection(alice, 'users/alice/orders'), { status: 'pending', total: 20, items: 1, date: 1, method: 'stripe', paymentIntentId: 'pi_1', stripeSessionId: null, lines: [] })));
  await check('Alice NE peut PAS créer une commande declared (canal crypto désactivé 16/07)', assertFails(addDoc(collection(alice, 'users/alice/orders'), { status: 'declared', total: 20, items: 1, date: 1, method: 'crypto:eth' })));
  await check('Alice NE peut PAS forger une commande paid', assertFails(addDoc(collection(alice, 'users/alice/orders'), { status: 'paid', total: 9999, items: 1, date: 1 })));
  await check('Alice NE peut PAS poser confirmedByWebhook', assertFails(addDoc(collection(alice, 'users/alice/orders'), { status: 'pending', total: 20, items: 1, date: 1, confirmedByWebhook: true })));
  await check('Alice NE peut PAS poser paidAt', assertFails(addDoc(collection(alice, 'users/alice/orders'), { status: 'pending', total: 20, items: 1, date: 1, paidAt: 1 })));
  await check('Alice NE peut PAS mettre un total non-numérique', assertFails(addDoc(collection(alice, 'users/alice/orders'), { status: 'pending', total: 'gratuit', items: 1, date: 1 })));
  await check('Alice NE peut PAS ajouter un champ hors allowlist à une commande', assertFails(addDoc(collection(alice, 'users/alice/orders'), { status: 'quote', total: 20, hacked: true })));
  await check('Alice NE peut PAS modifier une commande existante', assertFails(updateDoc(doc(alice, 'users/alice/orders/o1'), { status: 'paid' })));
  await check('Bob NE peut PAS écrire dans les commandes d\'Alice', assertFails(addDoc(collection(bob, 'users/alice/orders'), { status: 'quote', total: 1, items: 1, date: 1 })));
  await check('Bob NE peut PAS supprimer une commande d\'Alice', assertFails(deleteDoc(doc(bob, 'users/alice/orders/o1'))));

  console.log('\n── Droit à l\'oubli (M4) : le titulaire supprime ses données ──');
  await check('Alice PEUT supprimer sa propre commande', assertSucceeds(deleteDoc(doc(alice, 'users/alice/orders/o1'))));
  await check('Alice PEUT supprimer son propre profil', assertSucceeds(deleteDoc(doc(alice, 'users/alice'))));

  console.log('\n── Collections serveur : fermées au client ──');
  await check('Alice NE lit PAS payments/', assertFails(getDoc(doc(alice, 'payments/pay1'))));
  await check('Alice NE écrit PAS payments/', assertFails(setDoc(doc(alice, 'payments/pay2'), { amountCents: 1 })));
  await check('Alice NE écrit PAS product_overrides/ (prix catalogue)', assertFails(setDoc(doc(alice, 'product_overrides/p1'), { price: 1 })));
  await check('Alice NE lit PAS stripe_events/', assertFails(getDoc(doc(alice, 'stripe_events/e1'))));
  await check('Alice NE lit PAS rate_limits/', assertFails(getDoc(doc(alice, 'rate_limits/r1'))));
  await check('Alice NE lit PAS partner_applications/ (candidatures artisans)', assertFails(getDoc(doc(alice, 'partner_applications/app1'))));
  await check('Alice NE écrit PAS partner_applications/ (forger une candidature)', assertFails(setDoc(doc(alice, 'partner_applications/pirate'), { name: 'x', metier: 'y', tier: 'black' })));
  await check('Un anonyme NE lit PAS partner_applications/', assertFails(getDoc(doc(anon, 'partner_applications/app1'))));
  await check('Un anonyme NE lit PAS partners_private/ (qui paie / qui est invité)', assertFails(getDoc(doc(anon, 'partners_private/artisan1'))));
  await check('Alice NE lit PAS partners_private/', assertFails(getDoc(doc(alice, 'partners_private/artisan1'))));
  await check('Alice NE écrit PAS partners_private/', assertFails(setDoc(doc(alice, 'partners_private/artisan1'), { guest: false })));
  await check('Alice NE lit PAS invite_codes/ (deviner un code)', assertFails(getDoc(doc(alice, 'invite_codes/PT-TEST01'))));
  await check('Alice NE peut PAS forger un code d\'invitation', assertFails(setDoc(doc(alice, 'invite_codes/GRATUIT'), { active: true, usedBy: '' })));
  await check('Un anonyme NE liste PAS invite_codes/', assertFails(getDocs(collection(anon, 'invite_codes'))));

  console.log('\n── Mesure d\'audience : fermée au client (lecture + écriture) ──');
  await check('Alice NE lit PAS analytics_daily/', assertFails(getDoc(doc(alice, 'analytics_daily/2026-07-17'))));
  await check('Alice NE écrit PAS analytics_daily/ (gonfler les compteurs)', assertFails(setDoc(doc(alice, 'analytics_daily/2026-07-17'), { pageViews: 9999 })));
  await check('Alice NE lit PAS analytics_products/', assertFails(getDoc(doc(alice, 'analytics_products/p1'))));
  await check('Alice NE lit PAS analytics_visitors/ (profil d\'affinité d\'autrui)', assertFails(getDoc(doc(alice, 'analytics_visitors/v1'))));
  await check('Alice NE écrit PAS analytics_geo/', assertFails(setDoc(doc(alice, 'analytics_geo/FR'), { count: 1 })));

  console.log('\n── Annuaire partners/ : lecture publique, écriture serveur seule ──');
  await check('Un ANONYME lit une carte partner (annuaire public)', assertSucceeds(getDoc(doc(anon, 'partners/artisan1'))));
  await check('Un anonyme LISTE les cartes partners', assertSucceeds(getDocs(collection(anon, 'partners'))));
  await check('Alice (connectée) lit une carte partner', assertSucceeds(getDoc(doc(alice, 'partners/artisan1'))));
  await check('Alice NE peut PAS créer une carte partner', assertFails(setDoc(doc(alice, 'partners/pirate'), { name: 'Faux', metier: 'x', tier: 'black', active: true, order: 0 })));
  await check('Alice NE peut PAS modifier une carte partner', assertFails(updateDoc(doc(alice, 'partners/artisan1'), { name: 'Piraté' })));
  await check('Un anonyme NE peut PAS écrire dans partners/', assertFails(setDoc(doc(anon, 'partners/pirate2'), { name: 'Faux' })));
  await check('Alice NE peut PAS supprimer une carte partner', assertFails(deleteDoc(doc(alice, 'partners/artisan1'))));

  console.log('\n── couriers_public/ : fiche livreur publique, écriture serveur seule ──');
  await check('Un ANONYME lit la fiche publique d\'un livreur', assertSucceeds(getDoc(doc(anon, 'couriers_public/bob'))));
  await check('Un anonyme LISTE l\'annuaire des livreurs', assertSucceeds(getDocs(collection(anon, 'couriers_public'))));
  await check('Bob NE peut PAS gonfler SON compteur de courses', assertFails(updateDoc(doc(bob, 'couriers_public/bob'), { coursesDone: 999 })));
  await check('Bob NE peut PAS se déclarer disponible sans passer par l\'API', assertFails(updateDoc(doc(bob, 'couriers_public/bob'), { available: true })));
  await check('Bob NE peut PAS s\'inventer un avis 5 étoiles', assertFails(updateDoc(doc(bob, 'couriers_public/bob'), { ratingCount: 50, ratingSum: 250 })));
  await check('Alice NE peut PAS créer une fausse fiche livreur', assertFails(setDoc(doc(alice, 'couriers_public/pirate'), { displayName: 'Faux', published: true })));
  await check('Alice NE lit PAS couriers/ (KYC, email, IBAN)', assertFails(getDoc(doc(alice, 'couriers/bob'))));

  console.log('\n── courses/{id}/messages : chat réservé aux DEUX participants ──');
  const carol = env.authenticatedContext('carol').firestore();
  await check('Alice NE lit PAS le document course lui-même (montants, code de remise)', assertFails(getDoc(doc(alice, 'courses/c1'))));
  const fil = (db, id, round) => query(collection(db, 'courses/' + id + '/messages'), where('round', '==', round));
  await check('Alice (cliente) LIT le fil de sa course', assertSucceeds(getDocs(fil(alice, 'c1', 1))));
  await check('Bob (livreur) LIT le fil de sa course', assertSucceeds(getDocs(fil(bob, 'c1', 1))));
  await check('Alice ÉCRIT un message sur sa course', assertSucceeds(addDoc(collection(alice, 'courses/c1/messages'), { uid: 'alice', role: 'client', text: 'A quelle heure ?', at: 2, round: 1 })));
  await check('Bob ÉCRIT un message sur sa course', assertSucceeds(addDoc(collection(bob, 'courses/c1/messages'), { uid: 'bob', role: 'livreur', text: 'Vers 9h', at: 3, round: 1 })));
  await check('Carol (tiers) NE lit PAS le fil d\'une course qui n\'est pas la sienne', assertFails(getDocs(fil(carol, 'c1', 1))));
  await check('Carol NE écrit PAS dans le fil d\'autrui', assertFails(addDoc(collection(carol, 'courses/c1/messages'), { uid: 'carol', role: 'client', text: 'coucou', at: 4, round: 1 })));
  await check('Un anonyme NE lit PAS un fil de course', assertFails(getDocs(fil(anon, 'c1', 1))));
  await check('Alice NE peut PAS signer un message au nom de Bob', assertFails(addDoc(collection(alice, 'courses/c1/messages'), { uid: 'bob', role: 'livreur', text: 'faux', at: 5, round: 1 })));
  await check('Alice NE peut PAS glisser un champ non prévu', assertFails(addDoc(collection(alice, 'courses/c1/messages'), { uid: 'alice', role: 'client', text: 'x', at: 6, round: 1, admin: true })));
  await check('Message VIDE refusé', assertFails(addDoc(collection(alice, 'courses/c1/messages'), { uid: 'alice', role: 'client', text: '', at: 7, round: 1 })));
  await check('Message de plus de 800 caractères refusé', assertFails(addDoc(collection(alice, 'courses/c1/messages'), { uid: 'alice', role: 'client', text: 'x'.repeat(801), at: 8, round: 1 })));
  await check('Un message ne peut PAS être modifié (preuve en cas de litige)', assertFails(updateDoc(doc(alice, 'courses/c1/messages/m1'), { text: 'reecrit' })));
  await check('Un message ne peut PAS être supprimé', assertFails(deleteDoc(doc(alice, 'courses/c1/messages/m1'))));
  await check('Aucun fil sur une course INEXISTANTE', assertFails(addDoc(collection(alice, 'courses/fantome/messages'), { uid: 'alice', role: 'client', text: 'x', at: 9, round: 1 })));
  await check('Un message d\'un AUTRE round est refusé à l\'écriture', assertFails(addDoc(collection(alice, 'courses/c1/messages'), { uid: 'alice', role: 'client', text: 'triche', at: 10, round: 2 })));
  await check('Lire le fil SANS filtrer le round est refusé (requête trop large)', assertFails(getDocs(collection(alice, 'courses/c1/messages'))));

  console.log('\n── Remise en ligne : le fil précédent devient inaccessible ──');
  // Le serveur (course-release) incrémente `round` et détache le livreur.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'courses/c1'), { round: 2, status: 'en_attente', courierUid: null, chatOpen: false });
  });
  await check('Alice NE relit PAS l\'ancien fil (round 1) après remise en ligne', assertFails(getDocs(fil(alice, 'c1', 1))));
  await check('Bob (ex-livreur détaché) NE lit plus RIEN sur cette course', assertFails(getDocs(fil(bob, 'c1', 2))));
  await check('Bob (ex-livreur) NE peut plus écrire sur cette course', assertFails(addDoc(collection(bob, 'courses/c1/messages'), { uid: 'bob', role: 'livreur', text: 'encore moi', at: 11, round: 2 })));
  await check('Alice (cliente) écrit bien dans le NOUVEAU round', assertSucceeds(addDoc(collection(alice, 'courses/c1/messages'), { uid: 'alice', role: 'client', text: 'nouveau tour', at: 12, round: 2 })));

  console.log('\n── DISCUSSION DIRECTE client ↔ livreur (conversations/) ──');
  const CONV = 'conversations/alice_bob';
  await check('Alice (cliente) LIT sa conversation', assertSucceeds(getDoc(doc(alice, CONV))));
  await check('Bob (livreur) LIT la même conversation', assertSucceeds(getDoc(doc(bob, CONV))));
  await check('Carol NE LIT PAS la conversation d\'autrui', assertFails(getDoc(doc(carol, CONV))));
  await check('Un anonyme NE LIT PAS une conversation', assertFails(getDoc(doc(anon, CONV))));

  // Le DOCUMENT est serveur-seul : c'est lui qui garantit que le livreur était
  // bien EN SERVICE. Si le client pouvait le forger, il contournerait ce
  // contrôle — et pourrait s'inscrire comme participant chez n'importe qui.
  await check('Alice NE PEUT PAS créer une conversation elle-même',
    assertFails(setDoc(doc(alice, 'conversations/alice_dave'), { clientUid: 'alice', courierUid: 'dave', createdAt: 1 })));
  await check('Alice NE PEUT PAS se rajouter dans une conversation existante',
    assertFails(updateDoc(doc(alice, 'conversations/alice_bob'), { courierUid: 'alice' })));
  await check('Carol NE PEUT PAS se forger un accès en créant le document',
    assertFails(setDoc(doc(carol, CONV), { clientUid: 'carol', courierUid: 'bob', createdAt: 1 })));
  await check('Alice NE PEUT PAS supprimer la conversation',
    assertFails(deleteDoc(doc(alice, CONV))));

  await check('Alice LIT les messages de sa conversation', assertSucceeds(getDocs(collection(alice, CONV + '/messages'))));
  await check('Bob LIT les messages de sa conversation', assertSucceeds(getDocs(collection(bob, CONV + '/messages'))));
  await check('Carol NE LIT PAS les messages d\'autrui', assertFails(getDocs(collection(carol, CONV + '/messages'))));

  await check('Alice ÉCRIT un message', assertSucceeds(addDoc(collection(alice, CONV + '/messages'), { uid: 'alice', role: 'client', text: 'Tu passes quand ?', at: 2 })));
  await check('Bob ÉCRIT un message', assertSucceeds(addDoc(collection(bob, CONV + '/messages'), { uid: 'bob', role: 'livreur', text: 'Dans 20 min', at: 3 })));
  await check('Carol NE ÉCRIT PAS dans ce fil', assertFails(addDoc(collection(carol, CONV + '/messages'), { uid: 'carol', role: 'client', text: 'coucou', at: 4 })));
  await check('Alice NE PEUT PAS signer au nom de Bob', assertFails(addDoc(collection(alice, CONV + '/messages'), { uid: 'bob', role: 'livreur', text: 'faux', at: 5 })));
  await check('Alice NE PEUT PAS glisser un champ non prévu', assertFails(addDoc(collection(alice, CONV + '/messages'), { uid: 'alice', role: 'client', text: 'x', at: 6, admin: true })));
  await check('Message VIDE refusé', assertFails(addDoc(collection(alice, CONV + '/messages'), { uid: 'alice', role: 'client', text: '', at: 7 })));
  await check('Message de plus de 800 caractères refusé', assertFails(addDoc(collection(alice, CONV + '/messages'), { uid: 'alice', role: 'client', text: 'x'.repeat(801), at: 8 })));
  await check('Rôle inventé refusé', assertFails(addDoc(collection(alice, CONV + '/messages'), { uid: 'alice', role: 'admin', text: 'x', at: 9 })));
  await check('Un message est IMMUABLE (pas de modification)', assertFails(updateDoc(doc(alice, CONV + '/messages/m1'), { text: 'réécrit' })));
  await check('Un message est IMMUABLE (pas de suppression)', assertFails(deleteDoc(doc(alice, CONV + '/messages/m1'))));
  await check('Conversation INEXISTANTE : écriture refusée (fail-closed)',
    assertFails(addDoc(collection(alice, 'conversations/nexiste_pas/messages'), { uid: 'alice', role: 'client', text: 'x', at: 10 })));

  console.log('\n── Collections serveur : chaque règle est prouvée (audit P4) ──');
  const FERMEES = [
    ['charges/ch1', 'charges comptables'],
    ['refunds/rf1', 'remboursements saisis (montants + référence d\'avoir)'],
    ['config/pricing', 'config serveur (marge cible, facturation)'],
    ['price_watch_log/run1', 'journal du traqueur de prix'],
    ['courier_applications/bob', 'candidatures livreurs (pièce d\'identité, SIRET)'],
    ['courier_locations/bob', 'géolocalisation temps réel'],
    ['courier_config/bareme', 'barème / prix du carburant'],
    ['analytics_clicks/dock', 'compteurs de clics'],
    ['analytics_events_recent/e1', 'événements récents'],
    ['courses/c1/photos/scene', 'photos de preuve des courses']
  ];
  for (const [chemin, quoi] of FERMEES) {
    await check('Alice NE lit PAS ' + chemin + ' (' + quoi + ')', assertFails(getDoc(doc(alice, chemin))));
    await check('Alice NE écrit PAS ' + chemin, assertFails(setDoc(doc(alice, chemin), { pirate: true })));
  }
  await check('Bob (livreur) NE lit PAS les photos de preuve en direct', assertFails(getDoc(doc(bob, 'courses/c1/photos/scene'))));
  await check('Un anonyme NE lit PAS la config serveur', assertFails(getDoc(doc(anon, 'config/pricing'))));

  console.log('\n── Default-deny : collection inconnue ──');
  await check('Alice NE lit PAS une collection non prévue', assertFails(getDoc(doc(alice, 'secret_stuff/x'))));
  await check('Alice NE écrit PAS une collection non prévue', assertFails(setDoc(doc(alice, 'secret_stuff/x'), { a: 1 })));

  await env.cleanup();
  console.log('\n━━ ' + passed + ' passés, ' + failed + ' échoués ━━');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
