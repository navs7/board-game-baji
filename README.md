# BoardGameBaji

A mobile-first live scoreboard for board game nights. Scores update instantly for everyone watching — no app install, just open the link.

Hosted at: **https://navs7.github.io/board-game-baji/**

---

## App

One app (`index.html`) with a bottom tab bar:

| Tab | What it does |
|---|---|
| Live | Leader card, ranked rows, round chart. Animated waiting screen when no game is running |
| History | Past games with round-by-round scores and charts; search by game or player |
| Players | Leaderboard (wins / win % / games / A–Z), profiles, achievements, per-game breakdown |
| Host | Sign in, start/pause/resume/end games, enter scores, undo, reset, abandon |

Old links (`stats.html`, `admin.html`, `player.html?key=…`) redirect into the app.

Delete controls (games and players) appear only when signed in as the owner account (`DELETE_ADMIN` in `app.js`).

## Local development

Serve the folder with any static server (`python3 -m http.server 5000`). Add `?mock` to the URL (e.g. `http://localhost:5000/?mock`) to run against in-memory sample data instead of Firebase — nothing is read from or written to the real database.

---

## Tech Stack

- **Pure static HTML/CSS/JS** — no build step, no framework
- **Firebase Realtime Database** — live sync across all connected clients
- **Firebase Authentication** — email/password, protects the admin panel
- All Firebase SDK loaded from CDN (v10.8.0)

---

## Firebase Data Structure

```
/currentGame
  gameName        string
  gameStatus      "active" | "ended"
  rankingOrder    "highest" | "lowest"
  players/
    <playerKey>/
      name        string
      totalScore  number

/gameHistory
  <pushId>/
    gameName      string
    endedAt       timestamp
    rankingOrder  string
    winnerLabel   string
    players[]     array of { name, totalScore }

/playerRecords
  <playerKey>/
    name          string
    gamesPlayed   number
    wins          number
    totalScore    number
    lastPlayed    timestamp
```

---

## Access & Permissions

| Action | Who |
|---|---|
| View scoreboard | Anyone |
| View stats & history | Anyone |
| Manage games (admin panel) | Any authenticated user |
| Delete games / players | `****et@gmail.com` only |

The stats page shows the **Admin mode** badge and delete buttons only when:
1. Signed in as `*****et@gmail.com`, **and**
2. Navigated from the admin panel (via the Stats button there)

---

## Local Development

No build tools needed. Serve the files with any static server:

```bash
python3 -m http.server 5000
```

Then open `http://localhost:5000`.

---

## Deployment

The project is hosted on **GitHub Pages** from the `main` branch of `navs7/board-game-baji`. Push changes to `main` and they go live automatically.

---

## Self-hosting for a Different Community

Each community gets their own completely isolated copy — separate players, games, and scores. Nothing is shared with the original project.

### Step 1 — Fork the repo
Fork `navs7/board-game-baji` on GitHub into your own account.

### Step 2 — Create a Firebase project
1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project
2. Enable **Realtime Database** → create database → start in test mode
3. Enable **Authentication** → Sign-in method → **Email/Password**
4. Under Authentication → Users, add your admin email and password

### Step 3 — Update `firebase-config.js`
Replace the config object with your own project's values (found under Firebase Console → Project Settings → Your apps → SDK setup):

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
};
```

### Step 4 — Set your admin email in `stats.html`
Find this line in `app.js` and replace with your admin email:

```js

```

### Step 5 — Enable GitHub Pages
In your forked repo → **Settings** → **Pages** → Source: deploy from `main` branch → Save.

Your scoreboard will be live at `https://<your-github-username>.github.io/board-game-baji/`

### Step 6 — Lock down Firebase Database Rules (recommended)
In Firebase Console → Realtime Database → Rules, replace the default open rules with:

```json
{
  "rules": {
    ".read": true,
    ".write": "auth != null"
  }
}
```

This allows anyone to read (view the scoreboard/stats) but only authenticated admins to write.
