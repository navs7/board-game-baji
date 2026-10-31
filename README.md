# BoardGameBaji

A mobile-first live scoreboard for board game nights. The host enters scores on their phone; everyone else watches the scoreboard update in real time. No app install, no build step, no backend to run.

**Live site:** https://navs7.github.io/board-game-baji/

---

## What it does

One single-page app with a bottom tab bar:

| Tab | For | What you get |
|---|---|---|
| **Live** | Everyone | Leader card, ranked players, rank-change and score animations, win-streak flames, round-by-round chart. An animated waiting screen shows when no game is running. |
| **History** | Everyone | Every finished game, expandable to the full ranking, each player's round scores (R1, R2, …) and a round chart. Search by game or player. |
| **Players** | Everyone | Leaderboard sortable by wins, win rate, games played or name. Tap a player for their profile: stats, 12 achievements and a per-game accordion that highlights their own result and rounds. |
| **Host** | The host | Sign in, start a game (with quick-pick chips for recent games and players), enter scores per round, undo, reset, pause and resume, end and save, or abandon. |

Winning can be **highest score** or **lowest score** per game. Everything is built for one-handed phone use: large number inputs, bottom navigation, bottom sheets, custom confirm dialogs, dark and light themes.

### Old links

`stats.html`, `admin.html` and `player.html?key=…` are tiny redirect pages so old bookmarks keep working. They forward into the matching tab of the new app.

---

## Tech stack

- Plain static HTML, CSS and JavaScript (ES modules). No framework, no bundler.
- **Firebase Realtime Database** for live sync, **Firebase Authentication** (email and password) for the host.
- Firebase SDK v10.8.0 loaded from the Google CDN. Fonts (Bricolage Grotesque, DM Sans) from Google Fonts.
- Hosted on **GitHub Pages**.

## Project layout

```
index.html          App shell: header, the four views, tab bar, sheets, SVG icon sprite
styles.css          Design tokens (dark/light themes), components, animations
app.js              All app logic: routing, Live, History, Players, Host
data.js             Chooses the data layer: real Firebase, or mock.js when the URL has ?mock
firebase-config.js  Firebase project config and re-exports of the SDK functions used
mock.js             In-memory stand-in for Firebase with sample data, for local testing
stats.html          Redirect → index.html#history
admin.html          Redirect → index.html#host
player.html         Redirect → index.html#players/<key>
AGENTS.md           Context for AI coding agents working in this repo
```

Routes are hash-based: `#live`, `#history`, `#players`, `#players/<playerKey>` (opens a profile), `#host`.

---

## Local development

No tools to install. Serve the folder with any static server:

```bash
python3 -m http.server 5000
```

Then open `http://localhost:5000`.

**Safe testing:** add `?mock` to the URL (for example `http://localhost:5000/?mock`). The app then runs on in-memory sample data and never reads from or writes to the real database. In mock mode any email and password signs in, and the header says "BoardGameBaji · mock".

Without `?mock` the app talks to the real Firebase project, so starting, scoring and ending a game there writes real data.

---

## Firebase data structure

```
/currentGame
  gameStatus      "active" | "ended"
  gameName        string
  rankingOrder    "highest" | "lowest"
  startedAt       timestamp
  players/
    player_0/
      name        string
      totalScore  number
      history     number[]          one entry per round

/gameHistory
  <pushId>/
    gameName      string
    rankingOrder  "highest" | "lowest"
    winnerLabel   "Highest Score Wins" | "Lowest Score Wins"
    endedAt       timestamp
    players       [ { name, totalScore, rank, won, history[] } ]   sorted by rank

/playerRecords
  <playerKey>/                      key = name lowercased, with . # $ [ ] / and spaces → _
    name          string
    games/
      <gameId>/                     same id as in /gameHistory
        gameName, score, rank, won, winnerLabel, totalPlayers, endedAt
        roundHistory  number[]

/pausedGames
  <pushId>/                         a copy of /currentGame plus pausedAt
```

Firebase stores arrays as objects keyed `0, 1, 2…` once they pass through the database, so the app normalises every `history` / `players` array it reads.

Player stats, win rates, streaks and achievements are all computed in the browser from `/playerRecords`; nothing derived is stored.

---

## Access and permissions

| Action | Who |
|---|---|
| View scoreboard, history, players | Anyone |
| Run games (Host tab) | Any signed-in Firebase user |
| Delete games and players | The owner account only (`DELETE_ADMIN` in `app.js`) |

Delete buttons are shown only when signed in as the owner. **Real protection comes from the database rules**, not the UI. See step 6 below.

---

## Deployment

Hosted on GitHub Pages from the `main` branch of `navs7/board-game-baji`. Push to `main` and the site updates. There is nothing to build.

---

## Self-hosting for a different group

Each group gets a fully separate copy: its own players, games and scores.

1. **Fork** this repository.
2. **Create a Firebase project** at [console.firebase.google.com](https://console.firebase.google.com). Enable **Realtime Database** and **Authentication → Email/Password**, then add your host user under Authentication → Users.
3. **Update `firebase-config.js`** with your project's values (Project Settings → Your apps → SDK setup):
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
4. **Set your owner email** in `app.js`: `const DELETE_ADMIN = 'your-admin@example.com';`
5. **Set the share link** in `app.js`: `SHARE_URL` should be your GitHub Pages address.
6. **Lock down the database rules** (Realtime Database → Rules) so anyone can read but only signed-in users can write:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": "auth != null"
     }
   }
   ```
7. **Enable GitHub Pages** (Settings → Pages → deploy from `main`). Your app will be at `https://<your-username>.github.io/<repo-name>/`.

---

## Notes

- `.replit`, `replit.nix`, `server.py`, `attached_assets/` and `zipFile.zip` are leftovers from the original Replit project. The app does not use them.
- The Firebase project IDs still read `board-game-score-…`. That is the existing database; changing the config would point the app at an empty one.
