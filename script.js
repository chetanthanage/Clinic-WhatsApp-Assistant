/* =========================================================================
   Clinic WhatsApp Assistant — script.js
   Vanilla JS, no external libraries. Works fully offline (except WhatsApp).

   ARCHITECTURE NOTE:
   The Calendar is the single source of truth for appointment data. All
   other views (Doctor Reminder, All Appointments) read from the same
   DataStore module below — nothing is entered twice. DataStore is the
   only place that touches localStorage; swapping it for Firebase
   Firestore later means rewriting the bodies of DataStore's methods
   without touching any UI code that calls them.
   ========================================================================= */

(function () {
  'use strict';

  /* ======================================================================
     CONSTANTS
     ====================================================================== */

  const DOCTOR_NUMBER = '917248926087';
  const CLINIC_LOCATION_URL = 'https://maps.app.goo.gl/9QFgEV1qnKZRDiTPA';
  const DOCTOR_NAME = 'Dr. Rohini K. Patole';

  const APPT_STORAGE_KEY = 'clinic_appointments_v2';
  const MIGRATION_FLAG_KEY = 'clinic_migrated_v2';
  const LEGACY_TODAY_KEY = 'clinic_today_appointments';
  const LEGACY_TOMORROW_KEY = 'clinic_tomorrow_appointments';

  const STORAGE_KEYS = {
    THEME: 'clinic_theme'
  };

  const CLOCK_EMOJI = ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'];

  // Appointment type -> display label + accent colour (drives chips, dots, card borders, avatars)
  const TYPE_META = {
    counselling: { label: 'Counselling', color: 'purple' },
    followup: { label: 'Follow-up', color: 'blue' },
    new: { label: 'New Patient', color: 'green' },
    review: { label: 'Review', color: 'orange' },
    cancelled: { label: 'Cancelled', color: 'red' },
    completed: { label: 'Completed', color: 'grey' }
  };

  /* ======================================================================
     GENERAL UTILITIES
     ====================================================================== */

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

  /** Formats a Date as "YYYY-MM-DD" (local time, not UTC). */
  function isoDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  /** Parses a "YYYY-MM-DD" string into a local Date at midnight. */
  function parseISODate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
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

  /** Converts "HH:MM" (24hr) to "hh:MM AM/PM". */
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
    return formatFullDate(parseISODate(yyyyMmDd));
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

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));
  }

  function generateId() {
    return 'a_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  /** Returns up-to-2-letter initials for an avatar, e.g. "Saniya Shaikh" -> "SS". */
  function initialsFor(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function currentTimeLabel() {
    const now = new Date();
    return formatTime12h(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  }

  /* ======================================================================
     DATASTORE — single source of truth for all appointment data
     ====================================================================== */

  const DataStore = (function () {
    function _readAll() {
      try {
        const raw = localStorage.getItem(APPT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    function _writeAll(list) {
      localStorage.setItem(APPT_STORAGE_KEY, JSON.stringify(list));
    }

    return {
      getAll() {
        return _readAll();
      },

      getById(id) {
        return _readAll().find((a) => a.id === id) || null;
      },

      getByDate(dateStr) {
        return _readAll().filter((a) => a.date === dateStr);
      },

      /** Adds a new appointment record; assigns id + createdAt automatically. */
      add(appt) {
        const list = _readAll();
        const record = Object.assign(
          { id: generateId(), createdAt: new Date().toISOString() },
          appt
        );
        list.push(record);
        _writeAll(list);
        return record;
      },

      update(id, patch) {
        const list = _readAll();
        const idx = list.findIndex((a) => a.id === id);
        if (idx === -1) return null;
        list[idx] = Object.assign({}, list[idx], patch);
        _writeAll(list);
        return list[idx];
      },

      remove(id) {
        _writeAll(_readAll().filter((a) => a.id !== id));
      },

      /** Filters + sorts appointments. All options are optional. */
      query({ search, date, type, sort } = {}) {
        let list = _readAll();

        if (search) {
          const q = search.trim().toLowerCase();
          list = list.filter((a) => a.name.toLowerCase().includes(q));
        }
        if (date) {
          list = list.filter((a) => a.date === date);
        }
        if (type && type !== 'all') {
          list = list.filter((a) => a.type === type);
        }

        list.sort((a, b) => {
          const keyA = `${a.date} ${a.time}`;
          const keyB = `${b.date} ${b.time}`;
          return sort === 'desc' ? keyB.localeCompare(keyA) : keyA.localeCompare(keyB);
        });

        return list;
      }
    };
  })();

  /** One-time migration from the old separate Today/Tomorrow lists (pre-Calendar version). */
  function migrateLegacyData() {
    if (localStorage.getItem(MIGRATION_FLAG_KEY)) return;

    try {
      const oldToday = JSON.parse(localStorage.getItem(LEGACY_TODAY_KEY) || '[]');
      const oldTomorrow = JSON.parse(localStorage.getItem(LEGACY_TOMORROW_KEY) || '[]');
      const todayIso = isoDate(dateOffset(0));
      const tomorrowIso = isoDate(dateOffset(1));

      oldToday.forEach((a) => {
        DataStore.add({
          title: 'Ms.', name: a.name, mobile: a.mobile,
          date: todayIso, time: a.time, type: 'counselling', notes: ''
        });
      });
      oldTomorrow.forEach((a) => {
        DataStore.add({
          title: 'Ms.', name: a.name, mobile: a.mobile,
          date: tomorrowIso, time: a.time, type: 'counselling', notes: ''
        });
      });

      localStorage.removeItem(LEGACY_TODAY_KEY);
      localStorage.removeItem(LEGACY_TOMORROW_KEY);
    } catch (e) {
      /* ignore corrupt legacy data */
    }

    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
  }

  /** True if a today-dated, non-cancelled/completed appointment starts within the next hour. */
  function isStartingSoon(appt) {
    if (appt.date !== isoDate(dateOffset(0))) return false;
    if (appt.type === 'cancelled' || appt.type === 'completed') return false;
    const now = new Date();
    const [h, m] = appt.time.split(':').map(Number);
    const apptMinutes = h * 60 + m;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const diff = apptMinutes - nowMinutes;
    return diff >= 0 && diff <= 60;
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

  function openWhatsApp(number, message) {
    loadingOverlay.hidden = false;
    const url = `https://wa.me/${number}?text=${escapeForWhatsApp(message)}`;
    setTimeout(() => {
      window.open(url, '_blank');
      loadingOverlay.hidden = true;
    }, 700);
  }

  /* ======================================================================
     TABS
     ====================================================================== */

  const tabBtnCalendar = document.getElementById('tabBtnCalendar');
  const tabBtnReminder = document.getElementById('tabBtnReminder');
  const tabBtnAll = document.getElementById('tabBtnAll');
  const panelCalendar = document.getElementById('panelCalendar');
  const panelReminder = document.getElementById('panelReminder');
  const panelAll = document.getElementById('panelAll');

  function activateTab(which) {
    const map = {
      calendar: [tabBtnCalendar, panelCalendar],
      reminder: [tabBtnReminder, panelReminder],
      all: [tabBtnAll, panelAll]
    };
    Object.keys(map).forEach((key) => {
      const [btn, panel] = map[key];
      const active = key === which;
      btn.classList.toggle('tab--active', active);
      btn.setAttribute('aria-selected', String(active));
      panel.classList.toggle('panel--active', active);
      panel.hidden = !active;
    });
  }

  tabBtnCalendar.addEventListener('click', () => activateTab('calendar'));
  tabBtnReminder.addEventListener('click', () => activateTab('reminder'));
  tabBtnAll.addEventListener('click', () => activateTab('all'));

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
     DASHBOARD STATS — animated counters
     ====================================================================== */

  const statTodayEl = document.getElementById('statToday');
  const statTomorrowEl = document.getElementById('statTomorrow');
  const statWeekEl = document.getElementById('statWeek');
  const statMonthEl = document.getElementById('statMonth');
  const statUpcomingEl = document.getElementById('statUpcoming');

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

  function computeStats() {
    const all = DataStore.getAll();
    const todayIso = isoDate(dateOffset(0));
    const tomorrowIso = isoDate(dateOffset(1));

    const todayCount = all.filter((a) => a.date === todayIso).length;
    const tomorrowCount = all.filter((a) => a.date === tomorrowIso).length;

    const today = dateOffset(0);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartIso = isoDate(weekStart);
    const weekEndIso = isoDate(weekEnd);
    const weekCount = all.filter((a) => a.date >= weekStartIso && a.date <= weekEndIso).length;

    const monthPrefix = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
    const monthCount = all.filter((a) => a.date.startsWith(monthPrefix)).length;

    const nowDate = new Date();
    const upcomingEntry = all
      .filter((a) => a.type !== 'cancelled' && a.type !== 'completed')
      .map((a) => {
        const when = parseISODate(a.date);
        const [h, m] = a.time.split(':').map(Number);
        when.setHours(h, m, 0, 0);
        return { appt: a, when };
      })
      .filter((entry) => entry.when.getTime() >= nowDate.getTime())
      .sort((x, y) => x.when - y.when)[0];

    return {
      todayCount,
      tomorrowCount,
      weekCount,
      monthCount,
      upcoming: upcomingEntry ? upcomingEntry.appt : null,
      upcomingWhen: upcomingEntry ? upcomingEntry.when : null
    };
  }

  function updateStats() {
    const s = computeStats();
    animateNumber(statTodayEl, s.todayCount);
    animateNumber(statTomorrowEl, s.tomorrowCount);
    animateNumber(statWeekEl, s.weekCount);
    animateNumber(statMonthEl, s.monthCount);

    if (s.upcoming) {
      const isToday = isoDate(s.upcomingWhen) === isoDate(dateOffset(0));
      const dateLabel = isToday ? 'Today' : s.upcomingWhen.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      const timeLabel = formatTime12h(`${pad(s.upcomingWhen.getHours())}:${pad(s.upcomingWhen.getMinutes())}`);
      statUpcomingEl.textContent = `${s.upcoming.name} · ${timeLabel} · ${dateLabel}`;
    } else {
      statUpcomingEl.textContent = 'None';
    }
  }

  /* ======================================================================
     CUSTOM TIME PICKER (Hour / Minute / AM-PM)
     Native <input type="time"> silently follows the OS locale for
     12-hour vs 24-hour display, so on many devices no AM/PM control ever
     shows up. This control always exposes an explicit AM/PM choice and
     stores the result as a 24-hour "HH:MM" string in a hidden input.
     ====================================================================== */

  function populateHourOptions(selectEl) {
    for (let h = 1; h <= 12; h++) {
      const opt = document.createElement('option');
      opt.value = String(h);
      opt.textContent = pad(h);
      selectEl.appendChild(opt);
    }
  }

  function populateMinuteOptions(selectEl) {
    for (let m = 0; m < 60; m += 5) {
      const opt = document.createElement('option');
      opt.value = String(m);
      opt.textContent = pad(m);
      selectEl.appendChild(opt);
    }
  }

  function createTimePicker({ hourEl, minuteEl, amBtn, pmBtn, hiddenEl, wrapperEl, onChange }) {
    populateHourOptions(hourEl);
    populateMinuteOptions(minuteEl);

    let meridiem = null;

    function syncHidden() {
      const h = hourEl.value;
      const m = minuteEl.value;
      if (h && m !== '' && meridiem) {
        let hour24 = parseInt(h, 10) % 12;
        if (meridiem === 'PM') hour24 += 12;
        hiddenEl.value = `${pad(hour24)}:${pad(parseInt(m, 10))}`;
      } else {
        hiddenEl.value = '';
      }
      if (typeof onChange === 'function') onChange();
    }

    function setMeridiem(value) {
      meridiem = value;
      amBtn.classList.toggle('time-picker__meridiem-btn--active', value === 'AM');
      pmBtn.classList.toggle('time-picker__meridiem-btn--active', value === 'PM');
      syncHidden();
    }

    hourEl.addEventListener('change', syncHidden);
    minuteEl.addEventListener('change', syncHidden);
    amBtn.addEventListener('click', () => setMeridiem('AM'));
    pmBtn.addEventListener('click', () => setMeridiem('PM'));

    function setValue(hhmm) {
      if (!hhmm) {
        hourEl.value = '';
        minuteEl.value = '';
        meridiem = null;
        amBtn.classList.remove('time-picker__meridiem-btn--active');
        pmBtn.classList.remove('time-picker__meridiem-btn--active');
        hiddenEl.value = '';
        return;
      }
      const [hStr, mStr] = hhmm.split(':');
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      const mer = h >= 12 ? 'PM' : 'AM';
      let h12 = h % 12;
      if (h12 === 0) h12 = 12;

      if (!Array.from(minuteEl.options).some((o) => o.value === String(m))) {
        const opt = document.createElement('option');
        opt.value = String(m);
        opt.textContent = pad(m);
        minuteEl.appendChild(opt);
      }

      hourEl.value = String(h12);
      minuteEl.value = String(m);
      meridiem = mer;
      amBtn.classList.toggle('time-picker__meridiem-btn--active', mer === 'AM');
      pmBtn.classList.toggle('time-picker__meridiem-btn--active', mer === 'PM');
      hiddenEl.value = `${pad(h)}:${pad(m)}`;
    }

    function clear() {
      setValue('');
    }

    function setInvalid(show) {
      wrapperEl.classList.toggle('time-picker--invalid', show);
    }

    return { setValue, clear, setInvalid };
  }

  /* ======================================================================
     FIELD ERROR HELPERS
     ====================================================================== */

  function setFieldError(inputEl, errorEl, show) {
    errorEl.parentElement.classList.toggle('field--invalid', show);
    inputEl.classList.toggle('field__input--invalid', show);
  }
  function clearFieldError(inputEl, errorEl) {
    setFieldError(inputEl, errorEl, false);
  }
  /** For fields with no plain input element (e.g. the time picker). */
  function markFieldErrorVisible(errorEl, show) {
    errorEl.parentElement.classList.toggle('field--invalid', show);
  }

  /* ======================================================================
     GENERIC CONFIRM DIALOG
     ====================================================================== */

  const confirmOverlay = document.getElementById('confirmOverlay');
  const confirmMessage = document.getElementById('confirmMessage');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  const confirmOkBtn = document.getElementById('confirmOkBtn');
  let pendingConfirmAction = null;

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
    if (typeof pendingConfirmAction === 'function') pendingConfirmAction();
    closeConfirmDialog();
  });

  /* ======================================================================
     PATIENT CONFIRMATION MESSAGE (used by the "Send WhatsApp" action)
     ====================================================================== */

  function generateAppointmentMessage(appt) {
    return (
      `🏥 Appointment Confirmation\n\n` +
      `Dear ${appt.title} ${appt.name},\n\n` +
      `We are pleased to inform you that your appointment has been scheduled.\n\n` +
      `👨‍⚕️ Doctor: ${DOCTOR_NAME}\n` +
      `🗓️ Date: ${formatDateInputValue(appt.date)}\n` +
      `⏰ Time: ${formatTime12h(appt.time)}\n` +
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

  /* ======================================================================
     SHARED APPOINTMENT CARD RENDERER
     Used by the Day Detail modal, Doctor Reminder lists, and All
     Appointments list, so every view stays visually and behaviourally
     consistent.
     ====================================================================== */

  function renderApptCard(appt, opts) {
    opts = opts || {};
    const meta = TYPE_META[appt.type] || TYPE_META.counselling;

    const card = document.createElement('div');
    card.className = `appt-card appt-card--${meta.color}`;
    if (isStartingSoon(appt)) card.classList.add('appt-card--soon');
    card.dataset.id = appt.id;

    const avatar = document.createElement('span');
    avatar.className = 'appt-card__avatar';
    avatar.textContent = initialsFor(appt.name);

    const info = document.createElement('div');
    info.className = 'appt-card__info';

    const nameRow = document.createElement('div');
    nameRow.className = 'appt-card__name-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'appt-card__name';
    nameSpan.textContent = `${appt.title} ${appt.name}`;
    nameRow.appendChild(nameSpan);

    const typeChip = document.createElement('span');
    typeChip.className = `chip chip--${meta.color}`;
    typeChip.textContent = meta.label;
    nameRow.appendChild(typeChip);

    if (appt.date === isoDate(dateOffset(0))) {
      const todayChip = document.createElement('span');
      todayChip.className = 'chip chip--today';
      todayChip.textContent = 'Today';
      nameRow.appendChild(todayChip);
    }

    info.appendChild(nameRow);

    const metaRow = document.createElement('span');
    metaRow.className = 'appt-card__meta';
    let metaHtml =
      `<span><span class="material-symbols-rounded">schedule</span>${formatTime12h(appt.time)}</span>` +
      `<span><span class="material-symbols-rounded">phone</span>${escapeHtml(appt.mobile)}</span>`;
    if (opts.showDate) {
      metaHtml += `<span><span class="material-symbols-rounded">event</span>${formatDateInputValue(appt.date)}</span>`;
    }
    metaRow.innerHTML = metaHtml;
    info.appendChild(metaRow);

    if (appt.notes) {
      const notesEl = document.createElement('span');
      notesEl.className = 'appt-card__notes';
      notesEl.textContent = '📝 ' + appt.notes;
      info.appendChild(notesEl);
    }

    card.appendChild(avatar);
    card.appendChild(info);

    if (opts.showActions) {
      const actions = document.createElement('div');
      actions.className = 'appt-card__actions';
      const row = document.createElement('div');
      row.className = 'appt-card__actions-row';

      const waBtn = document.createElement('button');
      waBtn.className = 'appt-card__action appt-card__action--whatsapp';
      waBtn.type = 'button';
      waBtn.setAttribute('aria-label', `Send WhatsApp message to ${appt.name}`);
      waBtn.innerHTML = '<span class="material-symbols-rounded">send</span>';
      waBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openWhatsApp(appt.mobile, generateAppointmentMessage(appt));
      });

      const editBtn = document.createElement('button');
      editBtn.className = 'appt-card__action appt-card__action--edit';
      editBtn.type = 'button';
      editBtn.setAttribute('aria-label', `Edit appointment for ${appt.name}`);
      editBtn.innerHTML = '<span class="material-symbols-rounded">edit</span>';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openApptModal({ mode: 'edit', appt });
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'appt-card__action appt-card__action--delete';
      deleteBtn.type = 'button';
      deleteBtn.setAttribute('aria-label', `Delete appointment for ${appt.name}`);
      deleteBtn.innerHTML = '<span class="material-symbols-rounded">delete</span>';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteAppointment(appt);
      });

      row.appendChild(waBtn);
      row.appendChild(editBtn);
      row.appendChild(deleteBtn);
      actions.appendChild(row);
      card.appendChild(actions);
    }

    return card;
  }

  function confirmDeleteAppointment(appt) {
    openConfirmDialog(`Delete the appointment for "${appt.name}"? This cannot be undone.`, () => {
      DataStore.remove(appt.id);
      refreshEverything();
      if (!dayModalOverlay.hidden) renderDayModalList();
      showToast('Appointment deleted.');
    });
  }

  /* ======================================================================
     CALENDAR TAB
     ====================================================================== */

  const calendarTitleEl = document.getElementById('calendarTitle');
  const calendarWeekdaysEl = document.getElementById('calendarWeekdays');
  const calendarGridEl = document.getElementById('calendarGrid');
  const calPrevBtn = document.getElementById('calPrevBtn');
  const calNextBtn = document.getElementById('calNextBtn');
  const calTodayBtn = document.getElementById('calTodayBtn');

  let calendarViewDate = (function () {
    const t = dateOffset(0);
    return new Date(t.getFullYear(), t.getMonth(), 1);
  })();

  function renderCalendar() {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    calendarTitleEl.textContent = calendarViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (!calendarWeekdaysEl.children.length) {
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => {
        const span = document.createElement('span');
        span.textContent = d;
        calendarWeekdaysEl.appendChild(span);
      });
    }

    calendarGridEl.innerHTML = '';

    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const todayIso = isoDate(dateOffset(0));

    for (let i = 0; i < 42; i++) {
      const cellIndex = i - startWeekday + 1;
      let cellDate;
      let muted = false;

      if (cellIndex < 1) {
        cellDate = new Date(year, month - 1, daysInPrevMonth + cellIndex);
        muted = true;
      } else if (cellIndex > daysInMonth) {
        cellDate = new Date(year, month + 1, cellIndex - daysInMonth);
        muted = true;
      } else {
        cellDate = new Date(year, month, cellIndex);
      }

      const cellIso = isoDate(cellDate);
      const dayAppts = DataStore.getByDate(cellIso);

      const cell = document.createElement('div');
      cell.className = 'calendar-day';
      if (muted) cell.classList.add('calendar-day--muted');
      if (cellIso === todayIso) cell.classList.add('calendar-day--today');
      if (dayAppts.length > 0) {
        cell.classList.add('calendar-day--has-appts');
        cell.title = dayAppts.map((a) => a.name).join(', ');
      }
      cell.dataset.date = cellIso;

      const num = document.createElement('span');
      num.className = 'calendar-day__num';
      num.textContent = String(cellDate.getDate());
      cell.appendChild(num);

      if (dayAppts.length > 0) {
        const dotsWrap = document.createElement('div');
        dotsWrap.className = 'calendar-day__dots';
        const uniqueTypes = [...new Set(dayAppts.map((a) => a.type))].slice(0, 4);
        uniqueTypes.forEach((t) => {
          const dot = document.createElement('span');
          const color = (TYPE_META[t] || TYPE_META.counselling).color;
          dot.className = `dot dot--${color}`;
          dotsWrap.appendChild(dot);
        });
        cell.appendChild(dotsWrap);

        const count = document.createElement('span');
        count.className = 'calendar-day__count';
        count.textContent = String(dayAppts.length);
        cell.appendChild(count);
      }

      cell.addEventListener('click', () => openDayModal(cellIso));
      calendarGridEl.appendChild(cell);
    }
  }

  calPrevBtn.addEventListener('click', () => {
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
    renderCalendar();
  });
  calNextBtn.addEventListener('click', () => {
    calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
    renderCalendar();
  });
  calTodayBtn.addEventListener('click', () => {
    const t = dateOffset(0);
    calendarViewDate = new Date(t.getFullYear(), t.getMonth(), 1);
    renderCalendar();
  });

  /* ======================================================================
     DAY DETAIL MODAL
     ====================================================================== */

  const dayModalOverlay = document.getElementById('dayModalOverlay');
  const dayModalTitleEl = document.getElementById('dayModalTitle');
  const dayModalAddBtn = document.getElementById('dayModalAddBtn');
  const dayModalCloseBtn = document.getElementById('dayModalCloseBtn');
  const dayModalListEl = document.getElementById('dayModalList');
  const dayModalEmptyEl = document.getElementById('dayModalEmpty');

  let activeDayIso = null;

  function openDayModal(dateIso) {
    activeDayIso = dateIso;
    const d = parseISODate(dateIso);
    dayModalTitleEl.textContent = d.toLocaleDateString('en-US', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    renderDayModalList();
    dayModalOverlay.hidden = false;
  }
  function closeDayModal() {
    dayModalOverlay.hidden = true;
    activeDayIso = null;
  }
  function renderDayModalList() {
    const list = DataStore.query({ date: activeDayIso, sort: 'asc' });
    dayModalListEl.innerHTML = '';
    if (list.length === 0) {
      dayModalEmptyEl.hidden = false;
    } else {
      dayModalEmptyEl.hidden = true;
      list.forEach((appt) => dayModalListEl.appendChild(renderApptCard(appt, { showActions: true })));
    }
  }

  dayModalAddBtn.addEventListener('click', () => openApptModal({ mode: 'add', date: activeDayIso }));
  dayModalCloseBtn.addEventListener('click', closeDayModal);
  dayModalOverlay.addEventListener('click', (e) => {
    if (e.target === dayModalOverlay) closeDayModal();
  });

  /* ======================================================================
     ADD / EDIT APPOINTMENT MODAL
     ====================================================================== */

  const apptModalOverlay = document.getElementById('apptModalOverlay');
  const apptModalTitleEl = document.getElementById('apptModalTitle');
  const apptModalDateLabelEl = document.getElementById('apptModalDateLabel');
  const apptModalDateHidden = document.getElementById('apptModalDate');
  const apptModalIdHidden = document.getElementById('apptModalId');
  const apptModalTitleSelect = document.getElementById('apptModalTitleSelect');
  const apptModalTypeSelect = document.getElementById('apptModalType');
  const apptModalNameInput = document.getElementById('apptModalName');
  const apptModalNameError = document.getElementById('apptModalNameError');
  const apptModalMobileInput = document.getElementById('apptModalMobile');
  const apptModalMobileError = document.getElementById('apptModalMobileError');
  const apptModalTimeError = document.getElementById('apptModalTimeError');
  const apptModalNotesInput = document.getElementById('apptModalNotes');
  const apptModalCancelBtn = document.getElementById('apptModalCancelBtn');
  const apptModalSaveBtn = document.getElementById('apptModalSaveBtn');

  const apptModalTimePicker = createTimePicker({
    hourEl: document.getElementById('apptModalTimeHour'),
    minuteEl: document.getElementById('apptModalTimeMinute'),
    amBtn: document.getElementById('apptModalTimeAM'),
    pmBtn: document.getElementById('apptModalTimePM'),
    hiddenEl: document.getElementById('apptModalTime'),
    wrapperEl: document.getElementById('apptModalTimePicker')
  });

  let apptModalMode = 'add';

  function openApptModal({ mode, date, appt }) {
    apptModalMode = mode;
    apptModalIdHidden.value = appt ? appt.id : '';
    apptModalTitleEl.textContent = mode === 'edit' ? 'Edit Appointment' : 'Add Appointment';

    const targetDate = appt ? appt.date : date;
    apptModalDateHidden.value = targetDate;
    apptModalDateLabelEl.textContent = 'For ' + parseISODate(targetDate).toLocaleDateString('en-US', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });

    apptModalTitleSelect.value = appt ? appt.title : 'Ms.';
    apptModalTypeSelect.value = appt ? appt.type : 'counselling';
    apptModalNameInput.value = appt ? appt.name : '';
    apptModalMobileInput.value = appt ? appt.mobile : '';
    apptModalNotesInput.value = appt ? (appt.notes || '') : '';
    apptModalTimePicker.setValue(appt ? appt.time : '');

    clearFieldError(apptModalNameInput, apptModalNameError);
    clearFieldError(apptModalMobileInput, apptModalMobileError);
    markFieldErrorVisible(apptModalTimeError, false);
    apptModalTimePicker.setInvalid(false);

    apptModalOverlay.hidden = false;
    setTimeout(() => apptModalNameInput.focus(), 50);
  }

  function closeApptModal() {
    apptModalOverlay.hidden = true;
  }

  apptModalCancelBtn.addEventListener('click', closeApptModal);
  apptModalOverlay.addEventListener('click', (e) => {
    if (e.target === apptModalOverlay) closeApptModal();
  });

  apptModalMobileInput.addEventListener('input', () => {
    apptModalMobileInput.value = onlyDigits(apptModalMobileInput.value).slice(0, 10);
  });

  apptModalSaveBtn.addEventListener('click', () => {
    const name = apptModalNameInput.value.trim();
    const mobile = apptModalMobileInput.value.trim();
    const time = document.getElementById('apptModalTime').value;

    const nameValid = name.length > 0;
    const mobileValid = isValidMobile(mobile);
    const timeValid = time.length > 0;

    setFieldError(apptModalNameInput, apptModalNameError, !nameValid);
    setFieldError(apptModalMobileInput, apptModalMobileError, !mobileValid);
    markFieldErrorVisible(apptModalTimeError, !timeValid);
    apptModalTimePicker.setInvalid(!timeValid);

    if (!nameValid || !mobileValid || !timeValid) return;

    const data = {
      title: apptModalTitleSelect.value,
      name,
      mobile,
      date: apptModalDateHidden.value,
      time,
      type: apptModalTypeSelect.value,
      notes: apptModalNotesInput.value.trim()
    };

    if (apptModalMode === 'edit' && apptModalIdHidden.value) {
      DataStore.update(apptModalIdHidden.value, data);
      showToast('Appointment updated.');
    } else {
      DataStore.add(data);
      showToast('Appointment added.');
    }

    closeApptModal();
    refreshEverything();
    if (!dayModalOverlay.hidden) renderDayModalList();
  });

  /* ======================================================================
     DOCTOR REMINDER TAB (auto-read only, no manual entry)
     ====================================================================== */

  const todayListEl = document.getElementById('todayList');
  const tomorrowListEl = document.getElementById('tomorrowList');
  const todayEmptyEl = document.getElementById('todayEmpty');
  const tomorrowEmptyEl = document.getElementById('tomorrowEmpty');
  const todayDateLabel = document.getElementById('todayDateLabel');
  const tomorrowDateLabel = document.getElementById('tomorrowDateLabel');
  const reminderPreviewEl = document.getElementById('reminderPreview');
  const reminderTimestampEl = document.getElementById('reminderTimestamp');

  function initReminderDateLabels() {
    todayDateLabel.textContent = `Today's Appointments · ${weekdayName(dateOffset(0))}`;
    tomorrowDateLabel.textContent = `Tomorrow's Appointments · ${weekdayName(dateOffset(1))}`;
  }

  function buildAppointmentLines(list) {
    return list.map((a) => `${clockEmojiFor(a.time)} ${formatTime12h(a.time)} - ${a.name} (${a.mobile})`).join('\n');
  }

  function generateReminderMessage(todayList, tomorrowList) {
    const greeting = currentGreeting();
    const emoji = greetingEmoji(greeting);
    const hasToday = todayList.length > 0;
    const hasTomorrow = tomorrowList.length > 0;

    let body = `${greeting} Ma'am ${emoji}\n\n`;
    body += `Just a gentle reminder that we have the following counselling appointments scheduled:\n`;

    if (hasToday) {
      body += `\n🗓️ Today (${weekdayName(dateOffset(0))})\n\n`;
      body += buildAppointmentLines(todayList);
      body += `\n`;
    }
    if (hasTomorrow) {
      body += `\n🗓️ Tomorrow (${weekdayName(dateOffset(1))})\n\n`;
      body += buildAppointmentLines(tomorrowList);
      body += `\n`;
    }
    if (!hasToday && !hasTomorrow) {
      body += `\nThere are no appointments scheduled for today or tomorrow yet.\n`;
    }

    body += `\nWould you like me to call the patients to confirm their attendance, or would you like me to make any changes?\n\n`;
    body += `Thank you, Ma'am.\nHave a wonderful day! 😊`;

    return body;
  }

  function renderReminderLists() {
    const todayIso = isoDate(dateOffset(0));
    const tomorrowIso = isoDate(dateOffset(1));
    const todayList = DataStore.query({ date: todayIso, sort: 'asc' });
    const tomorrowList = DataStore.query({ date: tomorrowIso, sort: 'asc' });

    todayListEl.innerHTML = '';
    if (todayList.length === 0) {
      todayEmptyEl.hidden = false;
    } else {
      todayEmptyEl.hidden = true;
      todayList.forEach((a) => todayListEl.appendChild(renderApptCard(a, { showActions: false })));
    }

    tomorrowListEl.innerHTML = '';
    if (tomorrowList.length === 0) {
      tomorrowEmptyEl.hidden = false;
    } else {
      tomorrowEmptyEl.hidden = true;
      tomorrowList.forEach((a) => tomorrowListEl.appendChild(renderApptCard(a, { showActions: false })));
    }

    reminderPreviewEl.textContent = generateReminderMessage(todayList, tomorrowList);
    reminderTimestampEl.textContent = currentTimeLabel();
  }

  document.getElementById('copyReminderBtn').addEventListener('click', () => {
    copyToClipboard(reminderPreviewEl.textContent);
  });
  document.getElementById('sendDoctorBtn').addEventListener('click', () => {
    openWhatsApp(DOCTOR_NUMBER, reminderPreviewEl.textContent);
  });

  /* ======================================================================
     ALL APPOINTMENTS TAB (search, filter, sort, export)
     ====================================================================== */

  const searchInput = document.getElementById('searchInput');
  const filterDateInput = document.getElementById('filterDate');
  const filterTypeSelect = document.getElementById('filterType');
  const sortOrderSelect = document.getElementById('sortOrder');
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');
  const allAppointmentsListEl = document.getElementById('allAppointmentsList');
  const allAppointmentsEmptyEl = document.getElementById('allAppointmentsEmpty');
  const allAppointmentsCountEl = document.getElementById('allAppointmentsCount');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const printDateInput = document.getElementById('printDate');
  const printScheduleBtn = document.getElementById('printScheduleBtn');

  function currentFilters() {
    return {
      search: searchInput.value,
      date: filterDateInput.value || undefined,
      type: filterTypeSelect.value,
      sort: sortOrderSelect.value
    };
  }

  function renderAllAppointments() {
    const list = DataStore.query(currentFilters());
    allAppointmentsCountEl.textContent = `${list.length} appointment${list.length === 1 ? '' : 's'}`;
    allAppointmentsListEl.innerHTML = '';
    if (list.length === 0) {
      allAppointmentsEmptyEl.hidden = false;
    } else {
      allAppointmentsEmptyEl.hidden = true;
      list.forEach((a) => allAppointmentsListEl.appendChild(renderApptCard(a, { showActions: true, showDate: true })));
    }
  }

  [searchInput, filterDateInput, filterTypeSelect, sortOrderSelect].forEach((el) => {
    el.addEventListener('input', renderAllAppointments);
    el.addEventListener('change', renderAllAppointments);
  });

  clearFiltersBtn.addEventListener('click', () => {
    searchInput.value = '';
    filterDateInput.value = '';
    filterTypeSelect.value = 'all';
    sortOrderSelect.value = 'asc';
    renderAllAppointments();
  });

  function csvEscape(val) {
    const s = String(val == null ? '' : val);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  exportCsvBtn.addEventListener('click', () => {
    const list = DataStore.query(currentFilters());
    const header = ['Title', 'Name', 'Mobile', 'Date', 'Time', 'Type', 'Notes'];
    const rows = list.map((a) => [
      a.title, a.name, a.mobile, a.date, formatTime12h(a.time),
      (TYPE_META[a.type] || TYPE_META.counselling).label, (a.notes || '').replace(/\n/g, ' ')
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clinic-appointments-${isoDate(dateOffset(0))}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${list.length} appointment${list.length === 1 ? '' : 's'} as CSV.`);
  });

  const printScheduleTitleEl = document.getElementById('printScheduleTitle');
  const printScheduleBodyEl = document.getElementById('printScheduleBody');

  printScheduleBtn.addEventListener('click', () => {
    const dateIso = printDateInput.value || isoDate(dateOffset(0));
    const list = DataStore.query({ date: dateIso, sort: 'asc' });

    printScheduleTitleEl.textContent = 'Daily Schedule — ' + formatDateInputValue(dateIso);
    printScheduleBodyEl.innerHTML = '';

    if (list.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = 'No appointments scheduled for this day.';
      tr.appendChild(td);
      printScheduleBodyEl.appendChild(tr);
    } else {
      list.forEach((a) => {
        const tr = document.createElement('tr');
        tr.innerHTML =
          `<td>${formatTime12h(a.time)}</td>` +
          `<td>${escapeHtml(a.title)} ${escapeHtml(a.name)}</td>` +
          `<td>${escapeHtml(a.mobile)}</td>` +
          `<td>${escapeHtml((TYPE_META[a.type] || TYPE_META.counselling).label)}</td>` +
          `<td>${escapeHtml(a.notes || '')}</td>`;
        printScheduleBodyEl.appendChild(tr);
      });
    }

    window.print();
  });

  /* ======================================================================
     GLOBAL REFRESH
     ====================================================================== */

  function refreshEverything() {
    renderCalendar();
    renderReminderLists();
    renderAllAppointments();
    updateStats();
  }

  /* ======================================================================
     INIT
     ====================================================================== */

  function init() {
    migrateLegacyData();
    initReminderDateLabels();
    printDateInput.value = isoDate(dateOffset(0));

    refreshEverything();
    updateHeaderClock();
    setInterval(updateHeaderClock, 1000 * 30);

    // Re-checks "starting soon" highlights and Today/Tomorrow buckets
    // periodically so the dashboard stays accurate if left open.
    setInterval(refreshEverything, 1000 * 60);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
