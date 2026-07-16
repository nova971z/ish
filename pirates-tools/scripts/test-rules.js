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
  collection, addDoc, getDocs, setLogLevel
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
  await check('Alice NE peut PAS supprimer son profil', assertFails(deleteDoc(doc(alice, 'users/alice'))));

  console.log('\n── Commandes : statut ──');
  await check('Alice crée une commande quote', assertSucceeds(addDoc(collection(alice, 'users/alice/orders'), { status: 'quote', total: 20, items: 1, date: 1 })));
  await check('Alice crée une commande pending (paiement carte initié)', assertSucceeds(addDoc(collection(alice, 'users/alice/orders'), { status: 'pending', total: 20, items: 1, date: 1, method: 'stripe', paymentIntentId: 'pi_1', stripeSessionId: null, lines: [] })));
  await check('Alice crée une commande declared (crypto)', assertSucceeds(addDoc(collection(alice, 'users/alice/orders'), { status: 'declared', total: 20, items: 1, date: 1, method: 'crypto:eth' })));
  await check('Alice NE peut PAS forger une commande paid', assertFails(addDoc(collection(alice, 'users/alice/orders'), { status: 'paid', total: 9999, items: 1, date: 1 })));
  await check('Alice NE peut PAS poser confirmedByWebhook', assertFails(addDoc(collection(alice, 'users/alice/orders'), { status: 'pending', total: 20, items: 1, date: 1, confirmedByWebhook: true })));
  await check('Alice NE peut PAS poser paidAt', assertFails(addDoc(collection(alice, 'users/alice/orders'), { status: 'pending', total: 20, items: 1, date: 1, paidAt: 1 })));
  await check('Alice NE peut PAS mettre un total non-numérique', assertFails(addDoc(collection(alice, 'users/alice/orders'), { status: 'pending', total: 'gratuit', items: 1, date: 1 })));
  await check('Alice NE peut PAS ajouter un champ hors allowlist à une commande', assertFails(addDoc(collection(alice, 'users/alice/orders'), { status: 'quote', total: 20, hacked: true })));
  await check('Alice NE peut PAS modifier une commande existante', assertFails(updateDoc(doc(alice, 'users/alice/orders/o1'), { status: 'paid' })));
  await check('Alice NE peut PAS supprimer une commande', assertFails(deleteDoc(doc(alice, 'users/alice/orders/o1'))));
  await check('Bob NE peut PAS écrire dans les commandes d\'Alice', assertFails(addDoc(collection(bob, 'users/alice/orders'), { status: 'quote', total: 1, items: 1, date: 1 })));

  console.log('\n── Collections serveur : fermées au client ──');
  await check('Alice NE lit PAS payments/', assertFails(getDoc(doc(alice, 'payments/pay1'))));
  await check('Alice NE écrit PAS payments/', assertFails(setDoc(doc(alice, 'payments/pay2'), { amountCents: 1 })));
  await check('Alice NE écrit PAS product_overrides/ (prix catalogue)', assertFails(setDoc(doc(alice, 'product_overrides/p1'), { price: 1 })));
  await check('Alice NE lit PAS stripe_events/', assertFails(getDoc(doc(alice, 'stripe_events/e1'))));
  await check('Alice NE lit PAS rate_limits/', assertFails(getDoc(doc(alice, 'rate_limits/r1'))));

  console.log('\n── Default-deny : collection inconnue ──');
  await check('Alice NE lit PAS une collection non prévue', assertFails(getDoc(doc(alice, 'secret_stuff/x'))));
  await check('Alice NE écrit PAS une collection non prévue', assertFails(setDoc(doc(alice, 'secret_stuff/x'), { a: 1 })));

  await env.cleanup();
  console.log('\n━━ ' + passed + ' passés, ' + failed + ' échoués ━━');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
