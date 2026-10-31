/* In-memory stand-in for the Firebase API surface the app uses. Same schema as production. */
const now = Date.now();
const DAY = 86400000;

const tree = {
  currentGame: {
    gameStatus: 'active', gameName: 'Catan', rankingOrder: 'highest', startedAt: now - 3600000,
    players: {
      player_0: { name: 'Navneet', totalScore: 21, history: [5, 8, 8] },
      player_1: { name: 'Aarav', totalScore: 17, history: [7, 4, 6] },
      player_2: { name: 'Mira', totalScore: 14, history: [3, 6, 5] },
      player_3: { name: 'Kabir', totalScore: 9, history: [2, 3, 4] }
    }
  },
  gameHistory: {
    '-g1': {
      gameName: 'Azul', rankingOrder: 'highest', winnerLabel: 'Highest Score Wins', endedAt: now - 2 * DAY,
      players: [
        { name: 'Mira', totalScore: 74, rank: 1, won: true, history: [20, 25, 29] },
        { name: 'Navneet', totalScore: 61, rank: 2, won: false, history: [18, 20, 23] }
      ]
    },
    '-g2': {
      gameName: 'Golf Cards', rankingOrder: 'lowest', winnerLabel: 'Lowest Score Wins', endedAt: now - 9 * DAY,
      players: [
        { name: 'Navneet', totalScore: 18, rank: 1, won: true, history: [6, 5, 7] },
        { name: 'Aarav', totalScore: 25, rank: 2, won: false, history: [9, 8, 8] }
      ]
    }
  },
  playerRecords: {
    navneet: { name: 'Navneet', games: { '-g1': { gameName: 'Azul', score: 61, rank: 2, won: false, totalPlayers: 2, endedAt: now - 2 * DAY }, '-g2': { gameName: 'Golf Cards', score: 18, rank: 1, won: true, totalPlayers: 2, endedAt: now - 9 * DAY } } },
    mira: { name: 'Mira', games: { '-g1': { gameName: 'Azul', score: 74, rank: 1, won: true, totalPlayers: 2, endedAt: now - 2 * DAY } } },
    aarav: { name: 'Aarav', games: { '-g2': { gameName: 'Golf Cards', score: 25, rank: 2, won: false, totalPlayers: 2, endedAt: now - 9 * DAY } } },
    kabir: { name: 'Kabir', games: {} }
  }
};

const listeners = [];
const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const keysOf = path => path.split('/').filter(Boolean);

function getAt(path) {
  let n = tree;
  for (const k of keysOf(path)) {
    if (n == null || typeof n !== 'object') return null;
    n = n[k];
  }
  return n === undefined ? null : n;
}
function setAt(path, val) {
  const ks = keysOf(path);
  let n = tree;
  for (let i = 0; i < ks.length - 1; i++) {
    if (n[ks[i]] == null || typeof n[ks[i]] !== 'object') n[ks[i]] = {};
    n = n[ks[i]];
  }
  const last = ks[ks.length - 1];
  if (val == null) delete n[last]; else n[last] = clone(val);
}
const snapOf = path => ({ val: () => clone(getAt(path)) });
function notify(path) {
  listeners.forEach(l => {
    if (l.path === path || l.path.startsWith(path + '/') || path.startsWith(l.path + '/')) l.cb(snapOf(l.path));
  });
}

export const db = {};
export const ref = (_db, path) => ({ path, key: path.split('/').pop() });
export const set = async (r, v) => { setAt(r.path, v); notify(r.path); };
export const get = async r => snapOf(r.path);
export const remove = r => set(r, null);
export const push = r => { const k = '-m' + Math.random().toString(36).slice(2, 9); return { path: r.path + '/' + k, key: k }; };
export const onValue = (r, cb) => {
  const l = { path: r.path, cb };
  listeners.push(l);
  setTimeout(() => cb(snapOf(r.path)));
  return () => listeners.splice(listeners.indexOf(l), 1);
};

let user = null;
const authCbs = [];
export const auth = {};
export const onAuthStateChanged = (_a, cb) => { authCbs.push(cb); setTimeout(() => cb(user)); };
export const signInWithEmailAndPassword = async (_a, email, pw) => {
  if (!email || !pw) throw new Error('invalid');
  user = { email };
  authCbs.forEach(c => c(user));
};
export const signOut = async () => { user = null; authCbs.forEach(c => c(null)); };
