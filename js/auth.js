/* =========================================================================
   js/auth.js — Firebase Authentication (Email & Password).

   Exposes a small, app-agnostic API used by both login.html and
   index.html/js/app.js:
     - onAuthReady(callback)   subscribe to auth state (fires on login,
                               logout, and automatically on page refresh
                               once Firebase restores the saved session)
     - signIn(email, pass, remember)
     - signOutUser()
     - sendReset(email)
     - requireAuth()           call at the top of a protected page; redirects
                               to login.html if nobody is signed in
   ========================================================================= */

import { firebaseAuth } from './firebase-config.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

/** Subscribes to auth state changes. Returns the unsubscribe function. */
export function onAuthReady(callback) {
  return onAuthStateChanged(firebaseAuth, callback);
}

/**
 * Signs in with email/password. `remember` = true keeps the session across
 * browser restarts (localStorage-backed); false clears it when the tab/
 * browser closes (sessionStorage-backed) — this is the "Remember Me" box.
 */
export async function signIn(email, password, remember) {
  await setPersistence(firebaseAuth, remember ? browserLocalPersistence : browserSessionPersistence);
  const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
  return cred.user;
}

export async function signOutUser() {
  await signOut(firebaseAuth);
}

export function sendReset(email) {
  return sendPasswordResetEmail(firebaseAuth, email);
}

/**
 * Guards a protected page (index.html). Call this before rendering the
 * dashboard. Resolves with the signed-in user, or redirects to
 * login.html and never resolves (the redirect navigates away).
 */
export function requireAuth() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      unsubscribe();
      if (user) {
        resolve(user);
      } else {
        window.location.href = 'login.html';
      }
    });
  });
}

/** Human-readable text for Firebase Auth error codes, for toast/error UI. */
export function authErrorMessage(err) {
  const code = err && err.code;
  switch (code) {
    case 'auth/invalid-email': return 'That email address looks invalid.';
    case 'auth/user-disabled': return 'This account has been disabled.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Incorrect email or password.';
    case 'auth/too-many-requests': return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed': return 'Network error — check your internet connection.';
    default: return 'Something went wrong. Please try again.';
  }
}
