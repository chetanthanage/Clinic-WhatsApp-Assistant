/* =========================================================================
   utils/validators.js — form validation helpers.
   No DOM access, no Firebase, no app state. Safe to import anywhere.
   ========================================================================= */

export function isValidMobile(str) {
  return /^\d{10}$/.test(str || '');
}

export function isValidEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str || '');
}
