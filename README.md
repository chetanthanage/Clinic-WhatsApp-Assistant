# 🏥 Clinic WhatsApp Assistant

A premium, glassmorphism-styled web app for **Dr. Rohini K. Patole Clinic**. The **Calendar is the single source of truth** for every appointment — nothing is ever entered twice. From that one data set, the app automatically generates:

1. **Doctor Reminder** — a daily WhatsApp summary of today's and tomorrow's appointments, sent to the doctor.
2. **Patient Confirmation** — a per-appointment WhatsApp confirmation message, sent straight to the patient.

Built with plain **HTML5, CSS3, and vanilla JavaScript** — no frameworks, no build step, no backend. Works entirely offline except for the moment it hands off to WhatsApp.

---

## ✨ Features

### 📅 Calendar (central data source)
- Monthly grid with Previous / Next / Today navigation
- Today is highlighted; dates with appointments get colour-coded dots and a count badge
- Hover a date to see patient names; click a date to open its full day view
- Day view lists every appointment for that date with **Edit**, **Delete**, and **📱 Send WhatsApp** actions, plus an **Add Appointment** button
- Add/Edit modal captures Title, Name, Mobile, Time (Hour/Minute/AM-PM picker), Appointment Type, and optional Notes
- Colour legend: Counselling = purple, Follow-up = blue, New Patient = green, Review = orange, Cancelled = red, Completed = grey

### 🩺 Doctor Reminder (auto-read, no manual entry)
- Reads today's and tomorrow's appointments straight from the Calendar
- Auto-generated preview with time-of-day greeting, auto-detected weekdays, and a realistic WhatsApp chat-window bubble
- Copy Message / Send to Doctor (fixed WhatsApp number)
- Friendly empty state pointing back to the Calendar when nothing is scheduled

### 📋 All Appointments (search, filter, export)
- Search by patient name, filter by date, filter by appointment type, sort by time
- Each result card supports Edit / Delete / Send WhatsApp
- **Export CSV** of the current filtered results
- **Print Daily Schedule** for any chosen date (clean print-only layout)

### 📊 Dashboard
Always-visible stat cards: Today, Tomorrow, This Week, This Month, and the next Upcoming Appointment — all with animated counters.

### 🔔 Reminders
- A **Today** badge appears on any appointment scheduled for the current date
- Appointments starting within the next hour get a soft pulsing highlight

### 🎨 Design
- Glassmorphism cards over an animated pastel gradient background with floating blurred blobs
- Colour-coded gradient buttons and appointment-type chips, hover glow, ripple-on-click, animated stat counters
- Dark mode with its own colourful palette (not a simple inversion)

---

## 📁 Project Structure

```
clinic-whatsapp-assistant/
├── index.html   # App markup (calendar, modals, tabs, toast)
├── style.css    # Theme, glassmorphism, calendar grid, print styles, dark mode
├── script.js    # DataStore, calendar rendering, message generation, WhatsApp links
└── README.md    # This file
```

---

## 🏗️ Architecture

All appointment data lives behind a single `DataStore` module in `script.js`:

```js
DataStore.getAll()
DataStore.getById(id)
DataStore.getByDate(dateStr)
DataStore.add(appt)
DataStore.update(id, patch)
DataStore.remove(id)
DataStore.query({ search, date, type, sort })
```

Every view — Calendar, Doctor Reminder, All Appointments — calls these same methods. `DataStore` is currently backed by `localStorage`, but because every other part of the app only ever talks to it through this interface, swapping the internals for **Firebase Firestore** later means rewriting the bodies of these functions — no UI code needs to change.

Each appointment record looks like:

```json
{
  "id": "a_...",
  "title": "Ms.",
  "name": "Saniya Shaikh",
  "mobile": "9876543210",
  "date": "2026-07-28",
  "time": "18:45",
  "type": "counselling",
  "notes": "",
  "createdAt": "2026-07-28T10:15:00.000Z"
}
```

**Migrating from an older version:** if the browser has data from the previous (pre-Calendar) version of this app, it's automatically migrated into the new unified store the first time the page loads, then the old keys are removed.

---

## 🚀 Running Locally

No build tools or dependencies are required.

1. Download or clone this folder.
2. Open `index.html` directly in any modern browser, **or** serve it locally:
   ```bash
   npx serve .
   # or
   python3 -m http.server 8000
   ```

---

## 🌐 Deploying to GitHub Pages

1. Create a new GitHub repository (e.g. `clinic-whatsapp-assistant`).
2. Push these four files to the repository root (or a `docs/` folder).
3. In the repo, go to **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**.
5. Select the branch and folder, then **Save**.
6. GitHub will publish the site at:
   ```
   https://<your-username>.github.io/clinic-whatsapp-assistant/
   ```

---

## ⚙️ Configuration

All clinic-specific values live near the top of `script.js`:

```js
const DOCTOR_NUMBER = '917248926087';
const CLINIC_LOCATION_URL = 'https://maps.app.goo.gl/9QFgEV1qnKZRDiTPA';
const DOCTOR_NAME = 'Dr. Rohini K. Patole';
```

The appointment type colours/labels live in the `TYPE_META` object right below those constants. The reception desk signature ("Chetan Thanage") can be edited inside `generateAppointmentMessage()`.

---

## 🔒 Data & Privacy

All appointment data lives **only in your browser's Local Storage** on your own device. Nothing is sent anywhere except the final WhatsApp message, which opens through WhatsApp's own `wa.me` link when you tap **Send**. There is no backend, database, or analytics of any kind.

---

## 🛠️ Browser Support

Works in all modern browsers (Chrome, Edge, Safari, Firefox) on both desktop and mobile.
