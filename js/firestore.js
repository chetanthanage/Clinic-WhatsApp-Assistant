/* =========================================================================
   js/firestore.js — Cloud Firestore data layer.

   DESIGN NOTE (why DataStore still looks synchronous):
   The original app's DataStore (backed by localStorage) was synchronous —
   every screen calls DataStore.getAll()/query()/add()/update() and expects
   an immediate return value, with no UI code written as async/await. Rather
   than rewriting every call site in app.js (which the spec asks us not to
   disturb), DataStore here keeps an in-memory cache that is:
     1. Populated in real time by a Firestore onSnapshot() listener — so
        changes made on OTHER devices/tabs appear immediately, with no
        page refresh, exactly as required.
     2. Updated OPTIMISTICALLY the instant add()/update()/replace()/remove()
        is called, before the network write finishes — so the UI still
        feels instant and every existing call site keeps working unchanged.
   The actual Firestore write happens in the background; Firestore's own
   offline persistence (enabled in firebase-config.js) queues it and
   retries automatically if the connection is down.
   ========================================================================= */

import { firestoreDb, firebaseAuth } from './firebase-config.js';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const APPOINTMENTS_COL = 'appointments';
const LOGS_COL = 'logs';
const SETTINGS_COL = 'settings';
const TEMPLATES_COL = 'templates';
const SETTINGS_DOC_ID = 'clinic';

let _cache = new Map();     // id -> appointment record
let _ready = false;
let _unsubscribe = null;
const _changeListeners = new Set();
let _errorHandler = null;

function _notify() {
  _changeListeners.forEach((fn) => {
    try { fn(); } catch (e) { console.error('DataStore listener threw:', e); }
  });
}

function _reportError(err, context) {
  console.error(`Firestore error (${context}):`, err);
  if (typeof _errorHandler === 'function') _errorHandler(err, context);
}

function _stripId(record) {
  const clone = Object.assign({}, record);
  delete clone.id;
  return clone;
}

function _docToRecord(docSnap) {
  return Object.assign({ id: docSnap.id }, docSnap.data());
}

/** Registers a callback for write/listener failures (e.g. to show a toast). */
export function setErrorHandler(fn) {
  _errorHandler = fn;
}

/** One-time activity log entry. Fire-and-forget — never blocks the UI. */
export function logActivity(action, appointmentId, extra) {
  const user = firebaseAuth.currentUser;
  addDoc(collection(firestoreDb, LOGS_COL), Object.assign({
    action,
    appointmentId: appointmentId || null,
    performedBy: user ? (user.email || user.uid) : 'unknown',
    timestamp: serverTimestamp()
  }, extra || {})).catch((err) => console.error('Failed to write activity log:', err));
}

export const DataStore = {
  /** Starts the real-time appointments listener. Resolves once the first
   *  snapshot (local cache or server) has loaded, so the caller can hide a
   *  loading indicator at that point. Safe to call more than once. */
  start() {
    return new Promise((resolve, reject) => {
      if (_unsubscribe) { resolve(); return; }
      _unsubscribe = onSnapshot(
        collection(firestoreDb, APPOINTMENTS_COL),
        (snapshot) => {
          const next = new Map();
          snapshot.forEach((d) => next.set(d.id, _docToRecord(d)));
          _cache = next;
          const firstLoad = !_ready;
          _ready = true;
          if (firstLoad) resolve();
          _notify();
        },
        (err) => {
          _reportError(err, 'appointments sync');
          if (!_ready) reject(err);
        }
      );
    });
  },

  stop() {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
    _ready = false;
    _cache = new Map();
  },

  isReady() {
    return _ready;
  },

  /** Registers a callback fired whenever appointment data changes (local
   *  optimistic writes AND real-time changes from other devices/tabs). */
  onChange(fn) {
    _changeListeners.add(fn);
    return () => _changeListeners.delete(fn);
  },

  getAll() {
    return Array.from(_cache.values());
  },

  getById(id) {
    return _cache.get(id) || null;
  },

  getByDate(dateStr) {
    return Array.from(_cache.values()).filter((a) => a.date === dateStr);
  },

  /** Adds a new appointment record; assigns id + createdAt automatically. */
  add(appt) {
    const ref = doc(collection(firestoreDb, APPOINTMENTS_COL)); // client-side id, works offline
    const record = Object.assign({ id: ref.id, createdAt: new Date().toISOString() }, appt);
    _cache.set(ref.id, record);
    _notify();
    setDoc(ref, _stripId(record)).catch((err) => _reportError(err, 'save the appointment'));
    return record;
  },

  update(id, patch) {
    const existing = _cache.get(id);
    if (!existing) return null;
    const updatedAt = new Date().toISOString();
    const record = Object.assign({}, existing, patch, { updatedAt });
    _cache.set(id, record);
    _notify();
    updateDoc(doc(firestoreDb, APPOINTMENTS_COL, id), Object.assign({}, patch, { updatedAt }))
      .catch((err) => _reportError(err, 'update the appointment'));
    return record;
  },

  /** Fully overwrites a record (used by Undo, so stale fields from a
   *  cancelled/rescheduled state don't linger after restoring). */
  replace(id, record) {
    const full = Object.assign({}, record, { id, updatedAt: new Date().toISOString() });
    _cache.set(id, full);
    _notify();
    setDoc(doc(firestoreDb, APPOINTMENTS_COL, id), _stripId(full)).catch((err) => _reportError(err, 'restore the appointment'));
    return full;
  },

  remove(id) {
    _cache.delete(id);
    _notify();
    deleteDoc(doc(firestoreDb, APPOINTMENTS_COL, id)).catch((err) => _reportError(err, 'delete the appointment'));
  },

  /** Filters + sorts appointments. All options are optional. */
  query({ search, date, type, status, sort } = {}) {
    let list = Array.from(_cache.values());

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
    if (status && status !== 'all') {
      list = list.filter((a) => (a.status || 'scheduled') === status);
    }

    list.sort((a, b) => {
      const keyA = `${a.date} ${a.time}`;
      const keyB = `${b.date} ${b.time}`;
      return sort === 'desc' ? keyB.localeCompare(keyA) : keyA.localeCompare(keyB);
    });

    return list;
  }
};

/* ======================================================================
   SETTINGS & TEMPLATES
   Not wired into the current UI (there is no Settings screen yet), but
   fully functional — a future Settings page can read/write these directly
   instead of duplicating storage logic. See templates/appointmentTemplates.js
   for the default WhatsApp wording currently used everywhere in the app.
   ====================================================================== */

export async function getSettings() {
  const snap = await getDoc(doc(firestoreDb, SETTINGS_COL, SETTINGS_DOC_ID));
  return snap.exists() ? snap.data() : null;
}

export function saveSettings(data) {
  return setDoc(doc(firestoreDb, SETTINGS_COL, SETTINGS_DOC_ID), data, { merge: true });
}

export async function getTemplate(name) {
  const snap = await getDoc(doc(firestoreDb, TEMPLATES_COL, name));
  return snap.exists() ? snap.data().text : null;
}

export function saveTemplate(name, text) {
  return setDoc(doc(firestoreDb, TEMPLATES_COL, name), { text }, { merge: true });
}
