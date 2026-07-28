# 🏥 Clinic WhatsApp Assistant

A premium, glassmorphism-styled web app for **Dr. Rohini K. Patole Clinic**. The **Calendar is the single source of truth** for every appointment — nothing is ever entered twice. From that one data set, the app automatically generates:

1. **Doctor Reminder** — a daily WhatsApp summary of today's and tomorrow's appointments, sent to the doctor.
2. **Patient Confirmation / Cancellation / Reschedule** — per-appointment WhatsApp messages, sent straight to the patient.

Data lives in **Cloud Firestore** and is protected by **Firebase Authentication (Email & Password)**. There is no backend server, no Firebase Storage, no Hosting, no Cloud Functions — this is a static site (deployable to GitHub Pages) that talks directly to Firebase from the browser.

> **UI/UX is unchanged from the previous localStorage-only version.** This update only replaces *where the data lives* and adds a login screen in front of it — every screen, animation, colour, and interaction described below behaves exactly as before, now backed by real-time Firestore data instead of one device's browser storage.

---

## ✨ Features

*(All features below existed before this update and are unchanged — see "What's new" further down for what Firebase adds.)*

### 📅 Calendar (central data source)
Monthly grid, day view with Edit/Delete/Send WhatsApp, Add/Edit modal, colour-coded appointment types.

### 🩺 Doctor Reminder
Auto-generated daily WhatsApp summary of today's + tomorrow's appointments, read straight from the Calendar.

### ❌ Cancel / 🔁 Reschedule / ↩️ Undo
Guided cancellation with a required reason, reschedule with history tracking, and a 20-second Undo window for both.

### 📋 All Appointments
Search, filter (date/type/status), sort, a dedicated **Export CSV** modal, and a dedicated **Print Schedule** modal (date range + status/type filters, with Print Preview).

### 📊 Dashboard
Animated stat cards: Today, Tomorrow, This Week, This Month, next Upcoming Appointment.

### 🎨 Design
Glassmorphism cards, animated gradient background, colour-coded chips, dark mode, smooth pop-up animations, toast notifications.

---

## 🔥 What's new: Firebase Authentication + Cloud Firestore

- **Login screen** (`login.html`) — email/password sign-in, show/hide password, Remember Me, Forgot Password (Firebase's built-in reset email), loading state, inline error messages.
- **Auth guard** — `index.html` redirects to `login.html` if nobody is signed in, and restores the session automatically on refresh (`onAuthStateChanged`).
- **Logout** — button in the header, next to the signed-in user's email.
- **Real-time data** — appointments are stored in Cloud Firestore and synced live with `onSnapshot()`. Changes made on one device (or by another staff member) appear on every other open tab/device instantly, with no page refresh.
- **Instant-feeling writes** — creating/editing/cancelling/rescheduling/deleting an appointment updates the on-screen list immediately (optimistic local update), while the real write to Firestore happens in the background. See "How the sync works" below.
- **Offline support** — Firestore's IndexedDB persistence is enabled, so the app keeps showing the last-synced appointments if the connection drops, and automatically syncs any changes once it's back.
- **Activity log** — every create/update/cancel/reschedule/delete, reminder-sent, print-schedule, CSV-export, login, and logout is written to a `logs` collection with who did it and when.
- **Firestore Security Rules** (`firestore.rules`) — only signed-in users can read or write anything; nothing is public.

---

## 📁 Project Structure

```
clinic-whatsapp-assistant/
├── index.html                     # Dashboard (auth-guarded)
├── login.html                     # Login screen
├── firestore.rules                # Security rules (deploy via Firebase CLI)
├── css/
│   └── style.css                  # Theme, glassmorphism, calendar, print styles, login page, dark mode
├── js/
│   ├── firebase-config.js         # initializeApp() / getFirestore() / getAuth() — YOUR project keys go here
│   ├── auth.js                    # Sign in/out, session persistence, auth guard, password reset
│   ├── firestore.js               # Firestore-backed DataStore (real-time cache) + activity log + settings/templates
│   ├── login.js                   # login.html's form logic
│   └── app.js                     # Everything else: calendar, dashboard, doctor reminder, patient messaging,
│                                   #   print/export, settings/UI wiring (see note below on why this is one file)
├── utils/
│   ├── helpers.js                 # Pure date/formatting utilities
│   └── validators.js              # Mobile number / email validation
├── templates/
│   └── appointmentTemplates.js    # WhatsApp message text generators (confirmation/cancel/reschedule/reminder)
├── assets/
│   └── logo.png                   # Clinic logo (used in the header, login page, and boot screen)
└── README.md
```

**A note on `js/app.js`:** the spec's suggested structure splits the UI into `calendar.js`, `dashboard.js`, `doctor-reminder.js`, `patient-message.js`, `print.js`, `settings.js`, and `ui.js`. In the original app these all share one tightly-coupled render loop (`refreshEverything()` calls into all of them, they share the Day Detail modal, the toast/undo system, and dozens of DOM references) — the kind of coupling that took shape over the app's whole history. Mechanically splitting that into seven files without a real browser to test in risked introducing subtle bugs the "don't change existing functionality" requirement explicitly warns against. I kept that part as one file and focused the actual architectural change — swapping Local Storage for Firestore — on its own clean, fully modular layer (`firebase-config.js` / `auth.js` / `firestore.js`). If you'd like it split further, `app.js` is organized in the same clearly-labelled sections (`======` comment banners) it always was, so it's a mechanical (if tedious) follow-up rather than a redesign.

---

## 🏗️ Architecture: how the sync works

`js/firestore.js` exports a `DataStore` object with the **exact same method names and synchronous-feeling behaviour** the app always used:

```js
DataStore.getAll()
DataStore.getById(id)
DataStore.getByDate(dateStr)
DataStore.add(appt)
DataStore.update(id, patch)
DataStore.replace(id, record)
DataStore.remove(id)
DataStore.query({ search, date, type, status, sort })
```

Nothing in `app.js` had to be rewritten to `await` these — here's why:

1. **`DataStore.start()`** opens one real-time Firestore listener (`onSnapshot`) on the `appointments` collection and keeps an in-memory cache in sync with it. `getAll()`/`query()`/etc. just read that cache — instantly, like before.
2. **`add()`/`update()`/`replace()`/`remove()`** update that cache **immediately** (so the UI reacts with zero delay, exactly like the old localStorage version did), then fire the real Firestore write in the background. If it fails (e.g. you're offline), Firestore's own offline queue holds onto it and retries automatically when the connection returns.
3. **`DataStore.onChange(fn)`** is a second layer on top of that: it also fires whenever Firestore's *own* real-time listener reports a change — including ones made from another browser tab or another staff member's device. `app.js` registers one handler for this that re-renders everything, which is what makes multi-device sync work with no page refresh.

### Appointment document shape (`appointments` collection)

```json
{
  "id": "auto-generated by Firestore",
  "title": "Ms.",
  "name": "Saniya Shaikh",
  "mobile": "9876543210",
  "date": "2026-07-28",
  "time": "18:45",
  "type": "counselling",
  "status": "scheduled",
  "notes": "",
  "cancellationReason": "",
  "createdAt": "2026-07-28T10:15:00.000Z",
  "updatedAt": "2026-07-28T10:15:00.000Z"
}
```

> Internally the app still uses the shorter field names it always has (`name`/`date`/`time`/`type`) to avoid touching every render function. If you'd rather the Firestore documents use the longer field names from the original brief (`patientName`, `appointmentDate`, `appointmentTime`, `appointmentType`, `createdBy`), `js/firestore.js` is the one place that would need updating — functionally identical either way, this is a naming-only difference.

### Other collections

- **`settings`** (one document, id `clinic`) — clinic name, doctor name, WhatsApp number, address, map link. Read/write helpers (`getSettings()`/`saveSettings()`) exist in `js/firestore.js` and are fully functional, but there's no Settings screen in the UI yet to edit them (the app doesn't currently have one) — `templates/appointmentTemplates.js` still uses hardcoded constants so behaviour is unchanged. Wiring a Settings tab to these is a drop-in follow-up.
- **`templates`** — same story: `getTemplate()`/`saveTemplate()` are ready for an editable-templates screen; the app currently uses the built-in wording in `templates/appointmentTemplates.js`.
- **`logs`** — written automatically (see "What's new" above); there's no log-viewer screen, but you can browse it directly in the Firebase Console under Firestore.

---

## 🚀 Setup

### 1. Create a Firebase project
1. Go to the [Firebase Console](https://console.firebase.google.com/) → **Add project**.
2. Once created, click the **Web** icon (`</>`) to register a web app. You don't need Firebase Hosting — just the config object.
3. Copy the `firebaseConfig` object it gives you.

### 2. Enable Authentication
1. In the Firebase Console: **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**.
3. Under the **Users** tab, click **Add user** to create the first login (staff member's email + a password) — there's no public sign-up screen in this app on purpose, so the first account has to be created here.

### 3. Enable Firestore
1. **Build → Firestore Database → Create database**.
2. Choose **Production mode** (the security rules below lock it down properly either way).
3. Pick a region close to the clinic.
4. You don't need to create collections manually — the app creates `appointments`/`logs`/etc. documents the first time it writes one. Optionally pre-create the `settings` document (id `clinic`) with your clinic's real info.

### 4. Deploy the security rules
Using the [Firebase CLI](https://firebase.google.com/docs/cli):
```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # point it at this project; when it asks for a rules file, use firestore.rules
firebase deploy --only firestore:rules
```
Or paste the contents of `firestore.rules` directly into **Firestore → Rules** in the console and click **Publish**.

### 5. Add your config to the app
Open `js/firebase-config.js` and replace the placeholder values with the config object from step 1:
```js
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID'
};
```
These values aren't secret (they just identify your project) — actual access control is entirely handled by the security rules + Firebase Auth.

### 6. Run it
No build step. Any static file server works — Firebase's SDK is loaded from `https://www.gstatic.com` via ES module imports, so an internet connection is required the first time (after that, Firestore's offline cache takes over for appointment data).
```bash
npx serve .
# or
python3 -m http.server 8000
```
Then open `login.html` and sign in with the user you created in step 2.

---

## 🌐 Deploying to GitHub Pages

1. Push this whole folder to a GitHub repository.
2. **Settings → Pages → Build and deployment → Source**: Deploy from a branch, pick the branch/folder, **Save**.
3. In the Firebase Console, go to **Authentication → Settings → Authorized domains** and add your GitHub Pages domain (e.g. `your-username.github.io`) — Firebase Auth blocks sign-in from domains it doesn't recognise.
4. Visit `https://<your-username>.github.io/<repo>/login.html`.

---

## ⚠️ Known limitations / honest notes

- **I could not run this against a live Firebase project or a real browser** while building it (this environment has no network access) — the code follows the official Firebase v10 modular SDK API precisely, and every file passed a JavaScript syntax check, but please do a smoke test (sign in, add an appointment, reload, open a second tab) before relying on it day-to-day. If something doesn't line up with the SDK's current behaviour, the most likely spots are `js/firebase-config.js` (persistence setup) and `js/firestore.js` (the `onSnapshot`/optimistic-write logic).
- **No pagination** — `DataStore.start()` loads the entire `appointments` collection into memory, same as the old version loaded everything from localStorage. Fine for a single clinic's appointment volume; if this ever grows very large, the natural next step is scoping the Firestore listener to a date range (e.g. the visible calendar month) instead of the whole collection.
- **Settings/Templates collections exist but have no UI screen yet** — see the "Other collections" section above.
- **Favicon** uses `assets/logo.png` directly rather than a separate `.ico` file (browsers support PNG favicons natively; a dedicated `.ico` wasn't generated).

---

## 🔒 Data & Privacy

Appointment data now lives in your Firebase project's Cloud Firestore, access-controlled by Firebase Authentication and the rules in `firestore.rules` — only signed-in staff can read or write anything. Nothing is sent anywhere else except the WhatsApp messages you explicitly send via `wa.me` links.

---

## 🛠️ Browser Support

Works in all modern browsers (Chrome, Edge, Safari, Firefox) on both desktop and mobile. Requires ES module support (all browsers released in the last several years) since Firebase's SDK is loaded as ES modules.
