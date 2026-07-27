/* =========================================================================
   Clinic WhatsApp Assistant — script.js
   Vanilla JS, no external libraries. Works fully offline (except WhatsApp).
   ========================================================================= */

(function () {
  'use strict';

  /* ======================================================================
     CONSTANTS
     ====================================================================== */

  const DOCTOR_NUMBER = '917248926087';
  const CLINIC_LOCATION_URL = 'https://maps.app.goo.gl/9QFgEV1qnKZRDiTPA';
  const DOCTOR_NAME = 'Dr. Rohini K. Patole';

  const STORAGE_KEYS = {
    TODAY_LIST: 'clinic_today_appointments',
    TOMORROW_LIST: 'clinic_tomorrow_appointments',
    THEME: 'clinic_theme',
    APPOINTMENT_FORM: 'clinic_appointment_form'
  };

  const CLOCK_EMOJI = ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'];
  const CARD_COLORS = ['purple', 'blue', 'pink', 'green', 'orange'];

  /* ======================================================================
     STATE
     ====================================================================== */

  let todayAppointments = loadList(STORAGE_KEYS.TODAY_LIST);
  let tomorrowAppointments = loadList(STORAGE_KEYS.TOMORROW_LIST);

  // Tracks which list the "Add Appointment" modal is currently targeting.
  let activeModalList = null; // 'today' | 'tomorrow'

  // Tracks what the confirm dialog should do when the user confirms.
  let pendingConfirmAction = null;

  /* ======================================================================
     UTILITIES
     ====================================================================== */

  function loadList(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveList(key, list) {
    localStorage.setItem(key, JSON.stringify(list));
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** Returns a Date object offset by `days` from today, at midnight local time. */
  function dateOffset(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d;
  }

  function weekdayName(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }

  function formatFullDate(date) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  /** Detects greeting based on current time of day. */
  function currentGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  function greetingEmoji(greeting) {
    if (greeting === 'Good Morning') return '☀️';
    if (greeting === 'Good Afternoon') return '🌤️';
    return '🌙';
  }

  /** Converts "HH:MM" (24hr, from <input type="time">) to "hh:MM AM/PM". */
  function formatTime12h(hhmm) {
    if (!hhmm) return '';
    const [hStr, mStr] = hhmm.split(':');
    let h = parseInt(hStr, 10);
    const m = pad(parseInt(mStr, 10));
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${pad(h)}:${m} ${suffix}`;
  }

  /** Returns a clock-face emoji matching the given 24hr "HH:MM" time. */
  function clockEmojiFor(hhmm) {
    if (!hhmm) return '🕐';
    const h = parseInt(hhmm.split(':')[0], 10) % 12;
    return CLOCK_EMOJI[h];
  }

  /** Formats a "YYYY-MM-DD" date string as "08 July 2026". */
  function formatDateInputValue(yyyyMmDd) {
    if (!yyyyMmDd) return '';
    const [y, m, d] = yyyyMmDd.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return formatFullDate(date);
  }

  function onlyDigits(str) {
    return (str || '').replace(/\D/g, '');
  }

  function isValidMobile(str) {
    return /^\d{10}$/.test(str || '');
  }

  function escapeForWhatsApp(text) {
    return encodeURIComponent(text);
  }

  function generateId() {
    return 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  /** Returns up-to-2-letter initials for an avatar, e.g. "Saniya Shaikh" -> "SS". */
  function initialsFor(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function currentTimeLabel() {
    const now = new Date();
    return formatTime12h(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  }

  /* ======================================================================
     LIVE HEADER CLOCK
     ====================================================================== */

  const headerDateEl = document.getElementById('headerDate');
  const headerTimeEl = document.getElementById('headerTime');

  function updateHeaderClock() {
    const now = new Date();
    headerDateEl.textContent = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    headerTimeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  /* ======================================================================
     TOAST
     ====================================================================== */

  const toastEl = document.getElementById('toast');
  let toastTimer = null;

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('toast--visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('toast--visible');
    }, 2200);
  }

  /* ======================================================================
     CLIPBOARD
     ====================================================================== */

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast('Message copied to clipboard ✅'),
        () => fallbackCopy(text)
      );
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Message copied to clipboard ✅');
    } catch (e) {
      showToast('Could not copy automatically. Please select and copy manually.');
    }
    document.body.removeChild(textarea);
  }

  /* ======================================================================
     LOADING OVERLAY + WHATSAPP LAUNCH
     ====================================================================== */

  const loadingOverlay = document.getElementById('loadingOverlay');
  const statStatusEl = document.getElementById('statStatus');

  function openWhatsApp(number, message) {
    loadingOverlay.hidden = false;
    statStatusEl.textContent = 'Sending…';
    const url = `https://wa.me/${number}?text=${escapeForWhatsApp(message)}`;
    setTimeout(() => {
      window.open(url, '_blank');
      loadingOverlay.hidden = true;
      statStatusEl.textContent = 'Sent';
      setTimeout(() => { statStatusEl.textContent = 'Ready'; }, 3000);
    }, 700);
  }

  /* ======================================================================
     TABS
     ====================================================================== */

  const tabBtnReminder = document.getElementById('tabBtnReminder');
  const tabBtnAppointment = document.getElementById('tabBtnAppointment');
  const panelReminder = document.getElementById('panelReminder');
  const panelAppointment = document.getElementById('panelAppointment');

  function activateTab(which) {
    const reminderActive = which === 'reminder';

    tabBtnReminder.classList.toggle('tab--active', reminderActive);
    tabBtnAppointment.classList.toggle('tab--active', !reminderActive);
    tabBtnReminder.setAttribute('aria-selected', String(reminderActive));
    tabBtnAppointment.setAttribute('aria-selected', String(!reminderActive));

    panelReminder.classList.toggle('panel--active', reminderActive);
    panelAppointment.classList.toggle('panel--active', !reminderActive);
    panelReminder.hidden = !reminderActive;
    panelAppointment.hidden = reminderActive;
  }

  tabBtnReminder.addEventListener('click', () => activateTab('reminder'));
  tabBtnAppointment.addEventListener('click', () => activateTab('appointment'));

  /* ======================================================================
     THEME (DARK MODE)
     ====================================================================== */

  const themeToggle = document.getElementById('themeToggle');
  const themeToggleIcon = document.getElementById('themeToggleIcon');

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      themeToggleIcon.textContent = 'light_mode';
      themeToggle.setAttribute('aria-pressed', 'true');
    } else {
      document.documentElement.removeAttribute('data-theme');
      themeToggleIcon.textContent = 'dark_mode';
      themeToggle.setAttribute('aria-pressed', 'false');
    }
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }

  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyTheme(isDark ? 'light' : 'dark');
  });

  (function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME);
    if (saved) {
      applyTheme(saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme('dark');
    }
  })();

  /* ======================================================================
     STATS — animated counters
     ====================================================================== */

  const statTodayEl = document.getElementById('statToday');
  const statTomorrowEl = document.getElementById('statTomorrow');
  const statMessagesEl = document.getElementById('statMessages');

  function animateNumber(el, toValue) {
    const fromValue = parseInt(el.textContent, 10) || 0;
    if (fromValue === toValue) return;
    const duration = 420;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(fromValue + (toValue - fromValue) * eased);
      el.textContent = value;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function updateStats() {
    animateNumber(statTodayEl, todayAppointments.length);
    animateNumber(statTomorrowEl, tomorrowAppointments.length);
    animateNumber(statMessagesEl, (todayAppointments.length + tomorrowAppointments.length > 0 ? 1 : 0) + 1);
  }

  /* ======================================================================
     REMINDER TAB — RENDERING APPOINTMENT LISTS
     ====================================================================== */

  const todayListEl = document.getElementById('todayList');
  const tomorrowListEl = document.getElementById('tomorrowList');
  const todayEmptyEl = document.getElementById('todayEmpty');
  const tomorrowEmptyEl = document.getElementById('tomorrowEmpty');
  const todayDateLabel = document.getElementById('todayDateLabel');
  const tomorrowDateLabel = document.getElementById('tomorrowDateLabel');
  const reminderTimestampEl = document.getElementById('reminderTimestamp');

  function initDateLabels() {
    const today = dateOffset(0);
    const tomorrow = dateOffset(1);
    todayDateLabel.textContent = `Today's Appointments · ${weekdayName(today)}`;
    tomorrowDateLabel.textContent = `Tomorrow's Appointments · ${weekdayName(tomorrow)}`;
  }

  function sortByTime(list) {
    return [...list].sort((a, b) => a.time.localeCompare(b.time));
  }

  function renderApptCard(appt, index, listType) {
    const colorClass = 'appt-card--' + CARD_COLORS[index % CARD_COLORS.length];

    const card = document.createElement('div');
    card.className = 'appt-card ' + colorClass;
    card.dataset.id = appt.id;

    const avatar = document.createElement('span');
    avatar.className = 'appt-card__avatar';
    avatar.textContent = initialsFor(appt.name);

    const info = document.createElement('div');
    info.className = 'appt-card__info';

    const name = document.createElement('span');
    name.className = 'appt-card__name';
    name.textContent = appt.name;

    const meta = document.createElement('span');
    meta.className = 'appt-card__meta';
    meta.innerHTML =
      `<span><span class="material-symbols-rounded">schedule</span>${formatTime12h(appt.time)}</span>` +
      `<span><span class="material-symbols-rounded">phone</span>${appt.mobile}</span>`;

    info.appendChild(name);
    info.appendChild(meta);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'appt-card__delete';
    deleteBtn.type = 'button';
    deleteBtn.setAttribute('aria-label', `Delete appointment for ${appt.name}`);
    deleteBtn.innerHTML = '<span class="material-symbols-rounded">delete</span>';
    deleteBtn.addEventListener('click', () => confirmDeleteAppointment(appt.id, listType));

    card.appendChild(avatar);
    card.appendChild(info);
    card.appendChild(deleteBtn);
    return card;
  }

  function renderList(listType) {
    const list = listType === 'today' ? todayAppointments : tomorrowAppointments;
    const container = listType === 'today' ? todayListEl : tomorrowListEl;
    const emptyEl = listType === 'today' ? todayEmptyEl : tomorrowEmptyEl;

    container.innerHTML = '';
    const sorted = sortByTime(list);

    if (sorted.length === 0) {
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
      sorted.forEach((appt, i) => container.appendChild(renderApptCard(appt, i, listType)));
    }
  }

  function renderAllLists() {
    renderList('today');
    renderList('tomorrow');
    updateReminderPreview();
    updateStats();
  }

  function confirmDeleteAppointment(id, listType) {
    const list = listType === 'today' ? todayAppointments : tomorrowAppointments;
    const appt = list.find((a) => a.id === id);
    if (!appt) return;

    openConfirmDialog(
      `Delete the appointment for "${appt.name}"? This cannot be undone.`,
      () => {
        if (listType === 'today') {
          todayAppointments = todayAppointments.filter((a) => a.id !== id);
          saveList(STORAGE_KEYS.TODAY_LIST, todayAppointments);
        } else {
          tomorrowAppointments = tomorrowAppointments.filter((a) => a.id !== id);
          saveList(STORAGE_KEYS.TOMORROW_LIST, tomorrowAppointments);
        }
        renderAllLists();
        showToast('Appointment deleted.');
      }
    );
  }

  /* ======================================================================
     REMINDER TAB — ADD APPOINTMENT MODAL
     ====================================================================== */

  const modalOverlay = document.getElementById('modalOverlay');
  const modalTitle = document.getElementById('modalTitle');
  const modalPatientName = document.getElementById('modalPatientName');
  const modalApptTime = document.getElementById('modalApptTime');
  const modalMobile = document.getElementById('modalMobile');
  const modalPatientNameError = document.getElementById('modalPatientNameError');
  const modalApptTimeError = document.getElementById('modalApptTimeError');
  const modalMobileError = document.getElementById('modalMobileError');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalSaveBtn = document.getElementById('modalSaveBtn');

  function openAddModal(listType) {
    activeModalList = listType;
    modalTitle.textContent = listType === 'today' ? 'Add Appointment — Today' : 'Add Appointment — Tomorrow';
    modalPatientName.value = '';
    modalApptTime.value = '';
    modalMobile.value = '';
    clearFieldError(modalPatientName, modalPatientNameError);
    clearFieldError(modalApptTime, modalApptTimeError);
    clearFieldError(modalMobile, modalMobileError);
    modalOverlay.hidden = false;
    setTimeout(() => modalPatientName.focus(), 50);
  }

  function closeAddModal() {
    modalOverlay.hidden = true;
    activeModalList = null;
  }

  function setFieldError(inputEl, errorEl, show) {
    errorEl.parentElement.classList.toggle('field--invalid', show);
    inputEl.classList.toggle('field__input--invalid', show);
  }
  function clearFieldError(inputEl, errorEl) {
    setFieldError(inputEl, errorEl, false);
  }

  modalMobile.addEventListener('input', () => {
    modalMobile.value = onlyDigits(modalMobile.value).slice(0, 10);
  });

  document.getElementById('addTodayBtn').addEventListener('click', () => openAddModal('today'));
  document.getElementById('addTomorrowBtn').addEventListener('click', () => openAddModal('tomorrow'));
  modalCancelBtn.addEventListener('click', closeAddModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeAddModal();
  });

  modalSaveBtn.addEventListener('click', () => {
    const name = modalPatientName.value.trim();
    const time = modalApptTime.value;
    const mobile = modalMobile.value.trim();

    const nameValid = name.length > 0;
    const timeValid = time.length > 0;
    const mobileValid = isValidMobile(mobile);

    setFieldError(modalPatientName, modalPatientNameError, !nameValid);
    setFieldError(modalApptTime, modalApptTimeError, !timeValid);
    setFieldError(modalMobile, modalMobileError, !mobileValid);

    if (!nameValid || !timeValid || !mobileValid) return;

    const appt = { id: generateId(), name, time, mobile };

    if (activeModalList === 'today') {
      todayAppointments.push(appt);
      saveList(STORAGE_KEYS.TODAY_LIST, todayAppointments);
    } else {
      tomorrowAppointments.push(appt);
      saveList(STORAGE_KEYS.TOMORROW_LIST, tomorrowAppointments);
    }

    renderAllLists();
    closeAddModal();
    showToast('Appointment added.');
  });

  /* ======================================================================
     GENERIC CONFIRM DIALOG (Clear All / Delete)
     ====================================================================== */

  const confirmOverlay = document.getElementById('confirmOverlay');
  const confirmMessage = document.getElementById('confirmMessage');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  const confirmOkBtn = document.getElementById('confirmOkBtn');

  function openConfirmDialog(message, onConfirm) {
    confirmMessage.textContent = message;
    pendingConfirmAction = onConfirm;
    confirmOverlay.hidden = false;
  }

  function closeConfirmDialog() {
    confirmOverlay.hidden = true;
    pendingConfirmAction = null;
  }

  confirmCancelBtn.addEventListener('click', closeConfirmDialog);
  confirmOverlay.addEventListener('click', (e) => {
    if (e.target === confirmOverlay) closeConfirmDialog();
  });
  confirmOkBtn.addEventListener('click', () => {
    if (typeof pendingConfirmAction === 'function') {
      pendingConfirmAction();
    }
    closeConfirmDialog();
  });

  /* ======================================================================
     REMINDER TAB — MESSAGE GENERATION
     ====================================================================== */

  const reminderPreviewEl = document.getElementById('reminderPreview');

  function buildAppointmentLines(list) {
    return sortByTime(list)
      .map((a) => `${clockEmojiFor(a.time)} ${formatTime12h(a.time)} - ${a.name} (${a.mobile})`)
      .join('\n');
  }

  function generateReminderMessage() {
    const greeting = currentGreeting();
    const emoji = greetingEmoji(greeting);
    const today = dateOffset(0);
    const tomorrow = dateOffset(1);

    const hasToday = todayAppointments.length > 0;
    const hasTomorrow = tomorrowAppointments.length > 0;

    let body = `${greeting} Ma'am ${emoji}\n\n`;
    body += `Just a gentle reminder that we have the following counselling appointments scheduled:\n`;

    if (hasToday) {
      body += `\n🗓️ Today (${weekdayName(today)})\n\n`;
      body += buildAppointmentLines(todayAppointments);
      body += `\n`;
    }

    if (hasTomorrow) {
      body += `\n🗓️ Tomorrow (${weekdayName(tomorrow)})\n\n`;
      body += buildAppointmentLines(tomorrowAppointments);
      body += `\n`;
    }

    if (!hasToday && !hasTomorrow) {
      body += `\nThere are no appointments scheduled for today or tomorrow yet.\n`;
    }

    body += `\nWould you like me to call the patients to confirm their attendance, or would you like me to make any changes?\n\n`;
    body += `Thank you, Ma'am.\nHave a wonderful day! 😊`;

    return body;
  }

  function updateReminderPreview() {
    reminderPreviewEl.textContent = generateReminderMessage();
    reminderTimestampEl.textContent = currentTimeLabel();
  }

  document.getElementById('copyReminderBtn').addEventListener('click', () => {
    copyToClipboard(reminderPreviewEl.textContent);
  });

  document.getElementById('clearReminderBtn').addEventListener('click', () => {
    openConfirmDialog('Clear all appointments for both today and tomorrow? This cannot be undone.', () => {
      todayAppointments = [];
      tomorrowAppointments = [];
      saveList(STORAGE_KEYS.TODAY_LIST, todayAppointments);
      saveList(STORAGE_KEYS.TOMORROW_LIST, tomorrowAppointments);
      renderAllLists();
      showToast('All appointments cleared.');
    });
  });

  document.getElementById('sendDoctorBtn').addEventListener('click', () => {
    const message = generateReminderMessage();
    openWhatsApp(DOCTOR_NUMBER, message);
  });

  /* ======================================================================
     APPOINTMENT TAB — FORM HANDLING
     ====================================================================== */

  const titleSelect = document.getElementById('titleSelect');
  const patientName = document.getElementById('patientName');
  const patientMobile = document.getElementById('patientMobile');
  const apptDate = document.getElementById('apptDate');
  const apptTime = document.getElementById('apptTime');

  const patientNameError = document.getElementById('patientNameError');
  const patientMobileError = document.getElementById('patientMobileError');
  const apptDateError = document.getElementById('apptDateError');
  const apptTimeError = document.getElementById('apptTimeError');

  const appointmentPreviewEl = document.getElementById('appointmentPreview');
  const appointmentTimestampEl = document.getElementById('appointmentTimestamp');
  const waPatientHeaderName = document.getElementById('waPatientHeaderName');

  function generateAppointmentMessage() {
    const title = titleSelect.value;
    const name = patientName.value.trim() || '________';
    const dateStr = apptDate.value ? formatDateInputValue(apptDate.value) : '________';
    const timeStr = apptTime.value ? formatTime12h(apptTime.value) : '________';

    return (
      `🏥 Appointment Confirmation\n\n` +
      `Dear ${title} ${name},\n\n` +
      `We are pleased to inform you that your appointment has been scheduled.\n\n` +
      `👨‍⚕️ Doctor: ${DOCTOR_NAME}\n` +
      `🗓️ Date: ${dateStr}\n` +
      `⏰ Time: ${timeStr}\n` +
      `📍 Clinic Location:\n${CLINIC_LOCATION_URL}\n\n` +
      `Kindly arrive 5 minutes before your scheduled appointment.\n\n` +
      `If available, please carry any previous prescriptions, medical reports, or relevant documents.\n\n` +
      `We look forward to assisting you.\n\n` +
      `Thank you.\n\n` +
      `With regards,\n\n` +
      `Chetan Thanage\n` +
      `Reception Desk\n` +
      `Dr. Rohini K. Patole Clinic`
    );
  }

  function updateAppointmentPreview() {
    appointmentPreviewEl.textContent = generateAppointmentMessage();
    appointmentTimestampEl.textContent = currentTimeLabel();
    const title = titleSelect.value;
    const name = patientName.value.trim();
    waPatientHeaderName.textContent = name ? `${title} ${name}` : 'Patient';
    saveAppointmentForm();
  }

  function saveAppointmentForm() {
    const data = {
      title: titleSelect.value,
      name: patientName.value,
      mobile: patientMobile.value,
      date: apptDate.value,
      time: apptTime.value
    };
    localStorage.setItem(STORAGE_KEYS.APPOINTMENT_FORM, JSON.stringify(data));
  }

  function restoreAppointmentForm() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.APPOINTMENT_FORM);
      if (!raw) return;
      const data = JSON.parse(raw);
      titleSelect.value = data.title || 'Ms.';
      patientName.value = data.name || '';
      patientMobile.value = data.mobile || '';
      apptDate.value = data.date || '';
      apptTime.value = data.time || '';
    } catch (e) {
      /* ignore corrupt storage */
    }
  }

  [titleSelect, patientName, patientMobile, apptDate, apptTime].forEach((el) => {
    el.addEventListener('input', updateAppointmentPreview);
    el.addEventListener('change', updateAppointmentPreview);
  });

  patientMobile.addEventListener('input', () => {
    patientMobile.value = onlyDigits(patientMobile.value).slice(0, 10);
  });

  function validateAppointmentForm() {
    const nameValid = patientName.value.trim().length > 0;
    const mobileValid = isValidMobile(patientMobile.value.trim());
    const dateValid = apptDate.value.length > 0;
    const timeValid = apptTime.value.length > 0;

    setFieldError(patientName, patientNameError, !nameValid);
    setFieldError(patientMobile, patientMobileError, !mobileValid);
    setFieldError(apptDate, apptDateError, !dateValid);
    setFieldError(apptTime, apptTimeError, !timeValid);

    return nameValid && mobileValid && dateValid && timeValid;
  }

  document.getElementById('copyAppointmentBtn').addEventListener('click', () => {
    copyToClipboard(generateAppointmentMessage());
  });

  document.getElementById('resetAppointmentBtn').addEventListener('click', () => {
    openConfirmDialog('Reset the appointment form? All entered details will be cleared.', () => {
      titleSelect.value = 'Ms.';
      patientName.value = '';
      patientMobile.value = '';
      apptDate.value = '';
      apptTime.value = '';
      [patientName, patientMobile, apptDate, apptTime].forEach((el) => el.classList.remove('field__input--invalid'));
      [patientNameError, patientMobileError, apptDateError, apptTimeError].forEach((el) =>
        el.parentElement.classList.remove('field--invalid')
      );
      updateAppointmentPreview();
      showToast('Form reset.');
    });
  });

  document.getElementById('sendPatientBtn').addEventListener('click', () => {
    if (!validateAppointmentForm()) {
      showToast('Please fix the highlighted fields.');
      return;
    }
    const message = generateAppointmentMessage();
    openWhatsApp(patientMobile.value.trim(), message);
  });

  /* ======================================================================
     INIT
     ====================================================================== */

  function init() {
    initDateLabels();
    renderAllLists();
    restoreAppointmentForm();
    updateAppointmentPreview();
    updateHeaderClock();
    setInterval(updateHeaderClock, 1000 * 30);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
