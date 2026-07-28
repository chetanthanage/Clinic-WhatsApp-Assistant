/* =========================================================================
   utils/helpers.js — pure formatting / date utilities.
   No DOM access, no Firebase, no app state. Safe to import anywhere.
   ========================================================================= */

export const CLOCK_EMOJI = ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'];

export function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

/** Returns a Date object offset by `days` from today, at midnight local time. */
export function dateOffset(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

/** Formats a Date as "YYYY-MM-DD" (local time, not UTC). */
export function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parses a "YYYY-MM-DD" string into a local Date at midnight. */
export function parseISODate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function weekdayName(date) {
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

export function formatFullDate(date) {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Detects greeting based on current time of day. */
export function currentGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function greetingEmoji(greeting) {
  if (greeting === 'Good Morning') return '☀️';
  if (greeting === 'Good Afternoon') return '🌤️';
  return '🌙';
}

/** Converts "HH:MM" (24hr) to "hh:MM AM/PM". */
export function formatTime12h(hhmm) {
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
export function clockEmojiFor(hhmm) {
  if (!hhmm) return '🕐';
  const h = parseInt(hhmm.split(':')[0], 10) % 12;
  return CLOCK_EMOJI[h];
}

/** Formats a "YYYY-MM-DD" date string as "08 July 2026". */
export function formatDateInputValue(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  return formatFullDate(parseISODate(yyyyMmDd));
}

export function onlyDigits(str) {
  return (str || '').replace(/\D/g, '');
}

export function escapeForWhatsApp(text) {
  return encodeURIComponent(text);
}

export function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

/** Returns up-to-2-letter initials for an avatar, e.g. "Saniya Shaikh" -> "SS". */
export function initialsFor(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function currentTimeLabel() {
  const now = new Date();
  return formatTime12h(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
}
