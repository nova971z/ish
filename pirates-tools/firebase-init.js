// ============================================================
// FIREBASE — Configuration et initialisation
// ============================================================
//
// SETUP (a faire une seule fois) :
//
// 1. Va sur https://console.firebase.google.com/
// 2. Cree un projet (ex: "pirates-tools")
// 3. Active "Authentication" -> Sign-in method -> Email/Password
// 4. Active "Cloud Firestore" -> mode production
// 5. Dans Firestore -> Rules, colle :
//
//      rules_version = '2';
//      service cloud.firestore {
//        match /databases/{database}/documents {
//          match /users/{userId} {
//            allow read, write: if request.auth != null && request.auth.uid == userId;
//            match /orders/{orderId} {
//              allow read, write: if request.auth != null && request.auth.uid == userId;
//            }
//          }
//        }
//      }
//
// 6. Va dans Authentication -> Settings -> Authorized domains
//    Ajoute : nova971z.github.io  (et localhost pour les tests)
// 7. Project Settings (engrenage) -> General -> Your apps -> Web app (icone </>)
//    Donne un nom et copie l'objet firebaseConfig ci-dessous.
//
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyA4E5dMO7j5MMYoBupAedeR-CUCSb1bNyk",
  authDomain: "pirates-tools.firebaseapp.com",
  projectId: "pirates-tools",
  storageBucket: "pirates-tools.firebasestorage.app",
  messagingSenderId: "573379176641",
  appId: "1:573379176641:web:1360d109e2ff791282cc40",
  measurementId: "G-PHN6KHQWD2"
};

// ============================================================
// Ne rien modifier en dessous
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  updatePassword,
  updateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const isConfigured =
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY";

if (!isConfigured) {
  console.warn(
    "[Pirates Tools] Firebase non configure. Edite pirates-tools/firebase-init.js pour activer l'authentification."
  );
  window.PT_FIREBASE = { configured: false };
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  // Persistance locale (l'utilisateur reste connecte entre les sessions)
  setPersistence(auth, browserLocalPersistence).catch(function (err) {
    console.warn("[Pirates Tools] setPersistence failed:", err);
  });

  window.PT_FIREBASE = {
    configured: true,
    auth: auth,
    db: db,
    // Auth methods
    onAuthStateChanged: onAuthStateChanged,
    createUserWithEmailAndPassword: createUserWithEmailAndPassword,
    signInWithEmailAndPassword: signInWithEmailAndPassword,
    signOut: signOut,
    updateProfile: updateProfile,
    updatePassword: updatePassword,
    updateEmail: updateEmail,
    EmailAuthProvider: EmailAuthProvider,
    reauthenticateWithCredential: reauthenticateWithCredential,
    sendPasswordResetEmail: sendPasswordResetEmail,
    sendEmailVerification: sendEmailVerification,
    // Firestore methods
    doc: doc,
    getDoc: getDoc,
    setDoc: setDoc,
    updateDoc: updateDoc,
    collection: collection,
    addDoc: addDoc,
    getDocs: getDocs,
    query: query,
    orderBy: orderBy,
    limit: limit,
    serverTimestamp: serverTimestamp
  };
}

// Notifie l'app que Firebase est pret (configure ou non)
window.dispatchEvent(new Event("pt-firebase-ready"));
