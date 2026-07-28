/* =========================================================================
   js/firebase-config.js — Firebase bootstrap.

   *** REPLACE the values below with your own Firebase project's config ***
   (Firebase Console -> Project settings -> General -> "Your apps" -> SDK
   setup and configuration -> Config). These values are not secret — they
   identify your project to Google's servers, access is still governed by
   the Firestore Security Rules in /firestore.rules and by Firebase Auth —
   but they must point at YOUR project or nothing below will work.

   Only Firebase Authentication and Cloud Firestore are used anywhere in
   this app. Firebase Storage / Hosting / Cloud Functions / Realtime
   Database are intentionally not imported.
   ========================================================================= */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getAuth, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAkfPJr50iLphoqwnKyRI56VGA3BPax43A',
  authDomain: 'hospital-assistant-252e6.firebaseapp.com',
  projectId: 'hospital-assistant-252e6',
  storageBucket: 'hospital-assistant-252e6.firebasestorage.app',
  messagingSenderId: '489266309328',
  appId: '1:489266309328:web:75efa0a4b84119aef716d5'
};

export const firebaseApp = initializeApp(firebaseConfig);

// Firestore with offline persistence (IndexedDB) enabled, so the app keeps
// showing previously loaded appointments if the connection drops, and
// queues writes to sync automatically once it returns (see README ->
// "Offline Support").
let db;
try {
  db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
  });
} catch (e) {
  // Falls back to a plain (memory-cache) Firestore instance if persistence
  // can't be enabled (e.g. private browsing, or an already-initialized
  // instance from a previous hot-reload).
  db = getFirestore(firebaseApp);
}
export const firestoreDb = db;

export const firebaseAuth = getAuth(firebaseApp);
// Default session persistence; the login page overrides this per the
// "Remember Me" checkbox (see js/auth.js).
setPersistence(firebaseAuth, browserLocalPersistence).catch(() => { /* ignore */ });
