# AGENTS.md — BoardGameBaji

Context for AI coding agents working in this repo. Read this before changing anything.

## What this is

A mobile-first, real-time board game scoreboard. A host enters scores on a phone; spectators watch live. Static site on GitHub Pages, data in Firebase Realtime Database. **No build step, no framework, no package.json.** Users are friends at a game night, mostly on phones.

Live: https://navs7.github.io/board-game-baji/ · Repo: `navs7/board-game-baji` (renamed from `board-game-score`).

## Non-negotiables

1. **Do not lose or reshape existing data.** The Firebase database holds real game history and player records. Keep the same paths and field names (see schema below). Never change `firebase-config.js` values: the project IDs say `board-game-score-…` because that is the live database.
2. **Never write test data to the real database.** Test with `?mock` (see Testing). If you must touch the real DB, read only.
3. **Keep `sanitizeKey` identical** (`name.toLowerCase().replace(/[.#$[\]/\s]/g, '_')`). It builds `playerRecords` keys; changing it orphans every player's history.
4. **Normalise Firebase arrays.** Firebase returns arrays as objects. Always read `history`, `players`, `roundHistory` through `norm()` in `app.js`.
5. **Mobile first.** Design and verify at 360–390px wide before anything else. Touch targets ≥ 44px for primary actions (compact suggestion chips are a deliberate exception).
6. **No emoji as icons.** Icons are inline SVG symbols in the sprite at the top of `index.html`, used via the `icon('name')` helper.

## Files

| File | Role |
|---|---|
| `index.html` | App shell: header, four `<section class="view">` panels, tab bar, bottom sheets, confirm dialog, toast, and the SVG `<symbol>` icon sprite. Contains the inline theme-bootstrap script. |
| `styles.css` | All styling. Design tokens on `:root` (dark default) and `:root[data-theme="light"]`. Sections are commented: shell, cards, leader/rows, chart, waiting scene, forms, host, sheets, v1 (History/Players/Profile). |
| `app.js` | Everything else, in ordered sections: helpers → theme → routing → **Live** → **Host** → **History** → **Players** → profile accordion. Single ES module, no other deps. |
| `data.js` | Top-level `await import` of either `firebase-config.js` or `mock.js` (when URL has `?mock`) and re-exports the same API. `app.js` only imports from here. |
| `firebase-config.js` | Firebase init + re-exports (`db, ref, set, onValue, get, push, remove, auth, …`). |
| `mock.js` | In-memory fake of the same API (listeners, `set/get/push/remove`, fake auth) seeded with sample data. |
| `stats.html`, `admin.html`, `player.html` | Redirect stubs to `index.html#history`, `#host`, `#players/<key>`. Keep them; old bookmarks use them. |
| `.replit`, `replit.nix`, `server.py`, `attached_assets/`, `zipFile.zip`, `.agents/` | Legacy from the original Replit project. Unused. Don't build on them. |

## Architecture notes

- **Routing:** hash-based. `route()` in `app.js` reads `location.hash`: `#live | #history | #players | #players/<key> | #host`. `#players/<key>` opens the profile sheet (`pendingProfile` is retried when `playerRecords` data arrives).
- **State:** module-level objects. `live` (rank/score/streak tracking for animations), `store` (`players`, `games`, `admin`), `draft` (players chosen in the start-game form), `known` (suggestion chips). Views re-render fully from Firebase snapshots via `onValue`; Host score cards are updated in place so inputs keep focus.
- **Scrim:** one shared `#scrim` with a `scrimAction` callback. Sheets and `confirmAsk()` save/restore it. Reuse this pattern rather than adding new overlays.
- **Charts:** `chartMarkup(players, histories, focus)` returns SVG inner markup + legend; used by Live (`renderChart`), History cards and the profile game detail via `chartBlock()`. Bars = per-round score, line = cumulative. `focus` dims everyone but one player.
- **Streaks (Live):** a round winner is computed when all players have the same number of rounds; consecutive wins show a flame at ≥ 2. Recomputed from history on first render and after a reset.
- **Admin:** `DELETE_ADMIN` (owner email, constant in `app.js`) gates the delete buttons via `store.admin`. This is UI only; the real control is the Firebase rules (`.write: auth != null`).

## Data schema (Firebase Realtime Database)

```
/currentGame     { gameStatus: "active"|"ended", gameName, rankingOrder: "highest"|"lowest", startedAt,
                   players: { player_0: { name, totalScore, history: number[] }, … } }
/gameHistory/<pushId>  { gameName, rankingOrder, winnerLabel, endedAt,
                   players: [ { name, totalScore, rank, won, history[] } ] }   // sorted by rank
/playerRecords/<sanitizedKey>  { name, games: { <gameId>: { gameName, score, rank, won, winnerLabel,
                   totalPlayers, endedAt, roundHistory[] } } }                 // gameId == /gameHistory key
/pausedGames/<pushId>  { …a /currentGame document…, pausedAt }
```

**End game** (Host) writes `/gameHistory/<newId>`, then one `/playerRecords/<key>/games/<newId>` per player, then sets `/currentGame` to `{ gameStatus: "ended" }`. **Delete game** (History) removes `playerRecords/<key>/games/<id>` for each player and then `gameHistory/<id>`. Keep these two in sync or records orphan.

Scores are integers (`parseInt`); negatives are allowed and typed on the keyboard.

## Design system (summary)

Direction: "tabletop at night", warm and tactile. Dark warm-charcoal default, cream light mode; theme is stored in `localStorage` key `theme`.

- Tokens: `--bg --surface --surface-2 --line --text --muted --accent (terracotta) --gold (leader) --up --down`.
- Fonts: **Bricolage Grotesque** (display, scores) and **DM Sans** (body). Scores use tabular numerals.
- Radii ~20px cards, 999px pills. Motion ~220–450ms with `--ease: cubic-bezier(.22,1,.36,1)`. All animation must degrade under `prefers-reduced-motion` (see the media query at the end of `styles.css` and the waiting-scene override).
- Player colours (`COLORS` in `app.js`) are shared by charts and legends.
- The "no live game" scene (die, flipping playing cards, hopping meeples, floating score numbers) is pure CSS inside `.roll-stage`.
- Brand: name **BoardGameBaji**; mark is a die tile with a gold centre pip (inline SVG in the header, also the data-URI favicon).

## Testing

There is no test suite. Verify in a browser at phone size.

```bash
python3 -m http.server 5000    # then open http://localhost:5000/?mock
```

- `?mock` = in-memory sample data, safe to click everything. Any email/password signs in; delete controls show only for the `DELETE_ADMIN` email.
- Without `?mock` it uses the real database. Reading is fine; avoid start/score/end/delete there unless the user asked.
- When changing CSS/JS during a session, hard-reload (static servers and the browser cache aggressively).
- Check: Live (waiting and active), Host (login, start, score incl. negative, undo, sheet actions, end), History (expand, delete as admin), Players (sort, search, profile, game accordion), light mode, 360px width, reduced motion.

## Conventions

- Match existing style: 2-space indent, single quotes in JS, `$`/`$$` query helpers, template-literal rendering with `esc()` around **every** user-supplied string (names are user input).
- Prefer event delegation on list containers (see History/Players/Host handlers).
- Keep `app.js` as one module unless it becomes unwieldy; section banners (`/* ═════ HISTORY ═════ */`) mark boundaries.
- Don't add dependencies, a build step, or emoji. Don't add sections or pages the user didn't ask for.

## Deploying

GitHub Pages serves `main`. Work on a branch (current redesign: `redesign-v2`), push the branch, open a PR, merge when verified. Don't push to `main` or merge unless the user says so. Reverting the merge restores the previous site; the data is unaffected either way.

## Known gaps / ideas

- Light mode has had less visual review than dark.
- iPhone's numeric keypad has no minus key; negative scores need the full keyboard.
- The old admin "cleanup orphaned playerRecords" step on sign-in was intentionally dropped (it deleted data silently).
- Suggestion chips show the 5 most recent games and players.
