# 🏥 Clinic WhatsApp Assistant

A lightweight, mobile-first web app for **Dr. Rohini K. Patole Clinic** that generates ready-to-send WhatsApp messages for:

1. **Doctor Reminder** — a daily summary of today's and tomorrow's counselling appointments, sent to the doctor.
2. **Patient Appointment Confirmation** — a personalized confirmation message sent directly to a patient.

Built with plain **HTML5, CSS3, and vanilla JavaScript** — no frameworks, no build step, no backend. Works entirely offline except for the moment it hands off to WhatsApp.

---

## ✨ Features

- **Doctor Reminder tab**
  - Unlimited appointment cards for Today and Tomorrow
  - Add / delete appointments with validation
  - Auto-generated preview message with:
    - Time-of-day greeting (Good Morning / Afternoon / Evening)
    - Auto-detected weekday for "Today" and "Tomorrow"
    - Sorted appointment lines with matching clock-face emoji
  - Copy message, Clear All (with confirmation), Send to Doctor (fixed number)
- **Patient Appointment tab**
  - Title dropdown, name, 10-digit mobile, date, time
  - Read-only doctor name and clinic location
  - Live preview of the confirmation message
  - Copy, Reset (with confirmation), Send to Patient
- **Quality-of-life**
  - Dark mode toggle (persisted) with its own colourful gradient palette — not a simple inversion
  - Data automatically saved to Local Storage and restored on refresh
  - Toast notifications, confirmation dialogs, empty states, loading animation before opening WhatsApp
  - Fully responsive, mobile-first UI

- **Premium visual design**
  - Glassmorphism cards over an animated pastel gradient background with floating blurred blobs
  - Colour-coded gradient buttons (green = send to doctor, blue = send to patient, purple = copy, orange = add, red = delete, grey = reset)
  - Appointment cards cycle through purple/blue/pink/green/orange left-accent colours with initials avatars
  - Live dashboard stats (Today's Appointments, Tomorrow, Messages Ready, WhatsApp Status) with animated counters
  - Message previews render inside a realistic WhatsApp chat window with header, bubble, timestamp, and read ticks
  - Header shows the current date and a live clock alongside the dark mode toggle

---

## 📁 Project Structure

```
clinic-whatsapp-assistant/
├── index.html   # App markup (tabs, cards, modals, toast)
├── style.css    # Theme, layout, dark mode, animations
├── script.js    # State, rendering, message generation, storage, WhatsApp links
└── README.md    # This file
```

---

## 🚀 Running Locally

No build tools or dependencies are required.

1. Download or clone this folder.
2. Open `index.html` directly in any modern browser (double-click it), **or** serve it locally:
   ```bash
   npx serve .
   # or
   python3 -m http.server 8000
   ```
3. Visit the page and start using it.

---

## 🌐 Deploying to GitHub Pages

1. Create a new GitHub repository (e.g. `clinic-whatsapp-assistant`).
2. Push these four files to the repository root (or to a `docs/` folder).
3. In the repo, go to **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**.
5. Select the branch (e.g. `main`) and the folder (`/root` or `/docs`), then **Save**.
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

Update these constants if the doctor's number, clinic location link, or doctor's name ever change. The reception desk signature ("Chetan Thanage") can be edited inside the `generateAppointmentMessage()` function in `script.js`.

---

## 🔒 Data & Privacy

All appointment data and form entries are stored **only in your browser's Local Storage** on your own device. Nothing is sent anywhere except the final WhatsApp message, which opens through WhatsApp's own `wa.me` link when you tap **Send**. There is no backend, database, or analytics of any kind.

---

## 🛠️ Browser Support

Works in all modern browsers (Chrome, Edge, Safari, Firefox) on both desktop and mobile. Uses native `<input type="date">` and `<input type="time">` pickers, so the exact picker UI will match your device/browser.
