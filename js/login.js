/* =========================================================================
   js/login.js — Login page logic.
   ========================================================================= */

import { onAuthReady, signIn, sendReset, authErrorMessage } from './auth.js';
import { logActivity } from './firestore.js';
import { isValidEmail } from '../utils/validators.js';

const loginForm = document.getElementById('loginForm');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const loginEmailError = document.getElementById('loginEmailError');
const loginPasswordError = document.getElementById('loginPasswordError');
const loginRememberInput = document.getElementById('loginRemember');
const loginErrorBanner = document.getElementById('loginError');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');
const loginPasswordToggle = document.getElementById('loginPasswordToggle');
const loginPasswordToggleIcon = document.getElementById('loginPasswordToggleIcon');
const loginForgotBtn = document.getElementById('loginForgotBtn');

function setFieldError(inputEl, errorEl, show) {
  inputEl.classList.toggle('login-field__input--error', !!show);
  errorEl.classList.toggle('login-field__error--visible', !!show);
}

function showBanner(el, message) {
  el.textContent = message;
  el.classList.add('login-banner--visible');
}
function hideBanner(el) {
  el.classList.remove('login-banner--visible');
  el.textContent = '';
}

function setLoading(isLoading) {
  loginSubmitBtn.disabled = isLoading;
  loginSubmitBtn.classList.toggle('login-submit--loading', isLoading);
}

// If a session already exists (e.g. "Remember Me" from a previous visit),
// skip the login form entirely.
onAuthReady((user) => {
  if (user) window.location.href = 'index.html';
});

loginPasswordToggle.addEventListener('click', () => {
  const isPassword = loginPasswordInput.type === 'password';
  loginPasswordInput.type = isPassword ? 'text' : 'password';
  loginPasswordToggleIcon.textContent = isPassword ? 'visibility_off' : 'visibility';
  loginPasswordToggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideBanner(loginErrorBanner);

  const email = loginEmailInput.value.trim();
  const password = loginPasswordInput.value;

  const emailValid = isValidEmail(email);
  const passwordValid = password.length > 0;
  setFieldError(loginEmailInput, loginEmailError, !emailValid);
  setFieldError(loginPasswordInput, loginPasswordError, !passwordValid);
  if (!emailValid || !passwordValid) return;

  setLoading(true);
  try {
    await signIn(email, password, loginRememberInput.checked);
    logActivity('Login', null);
    window.location.href = 'index.html';
  } catch (err) {
    showBanner(loginErrorBanner, authErrorMessage(err));
    setLoading(false);
  }
});

/* ---------- Forgot password ---------- */
const resetModalOverlay = document.getElementById('resetModalOverlay');
const resetEmailInput = document.getElementById('resetEmail');
const resetError = document.getElementById('resetError');
const resetSuccess = document.getElementById('resetSuccess');
const resetCancelBtn = document.getElementById('resetCancelBtn');
const resetSendBtn = document.getElementById('resetSendBtn');

function openResetModal() {
  resetEmailInput.value = loginEmailInput.value.trim();
  hideBanner(resetError);
  hideBanner(resetSuccess);
  resetModalOverlay.hidden = false;
}
function closeResetModal() {
  resetModalOverlay.hidden = true;
}

loginForgotBtn.addEventListener('click', openResetModal);
resetCancelBtn.addEventListener('click', closeResetModal);
resetModalOverlay.addEventListener('click', (e) => {
  if (e.target === resetModalOverlay) closeResetModal();
});

resetSendBtn.addEventListener('click', async () => {
  hideBanner(resetError);
  hideBanner(resetSuccess);
  const email = resetEmailInput.value.trim();
  if (!isValidEmail(email)) {
    showBanner(resetError, 'Enter a valid email address.');
    return;
  }
  try {
    await sendReset(email);
    showBanner(resetSuccess, 'Reset link sent — check your inbox.');
  } catch (err) {
    showBanner(resetError, authErrorMessage(err));
  }
});
