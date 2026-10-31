import {
  IS_MOCK, db, ref, set, onValue, get, push,
  auth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from './data.js';

/* ── helpers ── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = h => (!h ? [] : Array.isArray(h) ? h : Object.values(h));   /* Firebase turns arrays into objects */
const sanitizeKey = name => name.toLowerCase().replace(/[.#$[\]/\s]/g, '_'); /* must match existing playerRecords keys */
const icon = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
const COLORS = ['#6aa8ff', '#f58bbd', '#4fd1a1', '#f2b84b', '#a78bfa', '#fb923c', '#38bdf8', '#e879f9'];
const SHARE_URL = 'https://navs7.github.io/board-game-baji/';

const gameRef = ref(db, 'currentGame');
const pausedRef = ref(db, 'pausedGames');

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

const scrim = $('#scrim');
let scrimAction = null;
scrim.addEventListener('click', () => scrimAction && scrimAction());

function confirmAsk({ title, msg, ok = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    const d = $('#confirm');
    const prevAction = scrimAction, wasShown = !scrim.hidden;
    $('#confirmTitle').textContent = title;
    $('#confirmMsg').textContent = msg;
    $('#confirmYes').textContent = ok;
    d.classList.toggle('danger', danger);
    d.hidden = scrim.hidden = false;
    const done = v => {
      d.hidden = true;
      scrim.hidden = !wasShown;
      scrimAction = prevAction;
      $('#confirmYes').onclick = $('#confirmNo').onclick = null;
      resolve(v);
    };
    $('#confirmYes').onclick = () => done(true);
    $('#confirmNo').onclick = () => done(false);
    scrimAction = () => done(false);
    $('#confirmNo').focus();
  });
}

/* ── theme ── */
function applyThemeIcon() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#themeIcon').setAttribute('href', dark ? '#i-sun' : '#i-moon');
  $('meta[name=theme-color]').content = dark ? '#171210' : '#f7efe4';
}
$('#themeBtn').addEventListener('click', () => {
  const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = n;
  try { localStorage.setItem('theme', n); } catch (e) {}
  applyThemeIcon();
});
applyThemeIcon();

/* ── routing ── */
let pendingProfile = null;
const store = { players: [], games: [], admin: false };
const DELETE_ADMIN = '07navneet@gmail.com';  /* only this account sees delete controls */
const TABS = ['live', 'history', 'players', 'host'];
function route() {
  const [h, arg] = location.hash.slice(1).split('/');
  const t = TABS.includes(h) ? h : 'live';
  pendingProfile = t === 'players' && arg ? decodeURIComponent(arg) : null;
  if (!pendingProfile) closeProfile();
  else openPendingProfile();
  TABS.forEach(n => { $('#view-' + n).hidden = n !== t; });
  $$('.tabbar a').forEach(a => {
    if (a.dataset.tab === t) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();

/* ═════════════ LIVE ═════════════ */
const live = { ranks: {}, scores: {}, streaks: {}, rounds: 0, first: true, key: '' };

function roundWinner(players, histories, idx, order) {
  const scored = players.map((p, i) => ({ name: p.name, s: histories[i][idx] ?? 0 }));
  return scored.reduce((b, p) => (order === 'lowest' ? (p.s < b.s ? p : b) : (p.s > b.s ? p : b)));
}

function updateStreaks(players, histories, order) {
  const lens = histories.map(h => h.length);
  const min = lens.length ? Math.min(...lens) : 0;
  const equal = lens.every(l => l === min);
  let hot = null;
  const apply = (idx, announce) => {
    const w = roundWinner(players, histories, idx, order);
    players.forEach(p => {
      if (p.name === w.name) {
        live.streaks[p.name] = (live.streaks[p.name] || 0) + 1;
        if (announce && live.streaks[p.name] >= 2) hot = p.name;
      } else live.streaks[p.name] = 0;
    });
  };
  if (live.first) {
    live.streaks = {};
    for (let r = 0; r < min; r++) apply(r, false);
    live.rounds = min;
  } else if (min < live.rounds) {
    live.streaks = {};
    live.rounds = min;
  } else if (equal && min > live.rounds) {
    apply(min - 1, true);
    live.rounds = min;
  }
  return hot;
}

function chartMarkup(players, histories, focus = -1) {
  const rounds = Math.max(...histories.map(h => h.length), 0);
  if (!rounds) return null;
  const cumul = histories.map(h => { let s = 0; return h.map(v => (s += v || 0)); });
  const W = 500, H = 220, pl = 36, pr = 12, pt = 14, pb = 28;
  const pw = W - pl - pr, ph = H - pt - pb;
  let minY = Math.min(0, ...histories.flat()), maxY = Math.max(10, ...cumul.flat());
  const span = maxY - minY || 10;
  minY -= span * .06; maxY += span * .1;
  const y = v => pt + ph - ((v - minY) / (maxY - minY)) * ph;
  const gw = pw / rounds, gap = 2;
  const bw = Math.max(2, (gw - gap * (players.length + 1)) / players.length);
  let o = '';
  for (let i = 0; i <= 4; i++) {
    const v = minY + (maxY - minY) * i / 4;
    o += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${pl - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${Math.round(v)}</text>`;
  }
  for (let r = 0; r < rounds; r++) o += `<text x="${(pl + r * gw + gw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">R${r + 1}</text>`;
  const base = y(0);
  for (let r = 0; r < rounds; r++) players.forEach((p, i) => {
    const s = histories[i][r];
    if (s == null) return;
    const h = Math.max(1, Math.abs(y(s) - base)), top = s >= 0 ? y(s) : base;
    o += `<rect class="bar-r${focus >= 0 && focus !== i ? ' dim' : ''}" style="--d:${r * 50 + i * 20}ms" x="${(pl + r * gw + gap + i * (bw + gap)).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${COLORS[i % 8]}"><title>${esc(p.name)} R${r + 1}: ${s}</title></rect>`;
  });
  const lineDelay = rounds * 50 + 150;
  players.forEach((p, i) => {
    if (!cumul[i].length) return;
    const pts = cumul[i].map((s, r) => `${(pl + r * gw + gw / 2).toFixed(1)},${y(s).toFixed(1)}`);
    o += `<polyline class="line${focus >= 0 && focus !== i ? ' dim' : ''}" pathLength="1" style="--d:${lineDelay + i * 90}ms" points="${pts.join(' ')}" stroke="${COLORS[i % 8]}"/>`;
    cumul[i].forEach((s, r) => {
      o += `<circle class="dot${focus >= 0 && focus !== i ? ' dim' : ''}" cx="${(pl + r * gw + gw / 2).toFixed(1)}" cy="${y(s).toFixed(1)}" r="4" fill="${COLORS[i % 8]}"><title>${esc(p.name)} total after R${r + 1}: ${s}</title></circle>`;
    });
  });
  const legend = players.map((p, i) => `<span class="${focus >= 0 && focus !== i ? 'dim' : ''}"><i style="background:${COLORS[i % 8]}"></i>${esc(p.name)}</span>`).join('');
  return { inner: o, legend };
}

function chartBlock(ch) {
  return `<div class="chart-block"><p class="eyebrow">Round by round</p><svg class="chart" viewBox="0 0 500 220" role="img" aria-label="Round scores chart">${ch.inner}</svg><div class="legend">${ch.legend}</div></div>`;
}

function renderChart(players, histories, animate) {
  const m = chartMarkup(players, histories);
  $('#chartCard').hidden = !m;
  if (!m) return;
  $('#chart').classList.toggle('animate', animate);
  $('#chart').innerHTML = m.inner;
  $('#legend').innerHTML = m.legend;
}

function bump(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

onValue(gameRef, snap => {
  const data = snap.val();
  const waiting = $('#waiting'), board = $('#board');
  if (!data || data.gameStatus !== 'active') {
    waiting.hidden = false; board.hidden = true;
    Object.assign(live, { ranks: {}, scores: {}, streaks: {}, rounds: 0, first: true, key: '' });
    return;
  }
  const key = data.gameName + '|' + (data.startedAt || '');
  if (key !== live.key) { live.first = true; live.key = key; }
  waiting.hidden = true; board.hidden = false;
  $('#gameTitle').textContent = data.gameName;
  const lowest = data.rankingOrder === 'lowest';
  $('#gameMode').textContent = lowest ? 'Lowest score wins' : 'Highest score wins';

  const players = Object.values(data.players || {}).map(p => ({ ...p, totalScore: p.totalScore || 0 }));
  players.sort((a, b) => lowest ? a.totalScore - b.totalScore : b.totalScore - a.totalScore);
  const histories = players.map(p => norm(p.history));
  const hot = updateStreaks(players, histories, data.rankingOrder);

  const flame = n => n >= 2 ? `<span class="streak ${hot ? '' : ''}">${icon('flame')}${n}</span>` : '';
  const lead = players[0];
  const gap = players[1] ? Math.abs(lead.totalScore - players[1].totalScore) : 0;
  $('#leaderCard').innerHTML = `
    <article class="leader ${live.first ? 'row-in' : ''}">
      <div class="leader-top"><span>${icon('trophy')}Leading</span>${flame(live.streaks[lead.name] || 0)}</div>
      <div class="leader-body">
        <div><h2 class="leader-name">${esc(lead.name)}</h2><p class="leader-meta">${players[1] ? (gap ? `${gap} ${lowest ? 'ahead (fewer)' : 'ahead'}` : 'Tied with ' + esc(players[1].name)) : 'Playing solo'}</p></div>
        <div class="leader-score" id="leadScore">${lead.totalScore}</div>
      </div>
    </article>`;

  const best = Math.max(1, ...players.map(p => Math.max(0, p.totalScore)));
  const worst = Math.max(1, ...players.map(p => Math.max(0, p.totalScore)));
  const pct = p => {
    const s = Math.max(0, p.totalScore);
    return Math.round((lowest ? (worst - s + 1) / (worst + 1) : s / best) * 100);
  };
  const rows = $('#rows');
  rows.innerHTML = players.slice(1).map((p, i) => `
    <li class="row" data-name="${esc(p.name)}">
      <span class="pos">${i + 2}</span>
      <span class="name">${esc(p.name)}${flame(live.streaks[p.name] || 0)}</span>
      <span class="score">${p.totalScore}</span>
      <span class="bar"><i style="width:${pct(p)}%"></i></span>
    </li>`).join('');

  const rowFor = n => $$('.row', rows).find(r => r.dataset.name === n);
  players.forEach((p, i) => {
    const el = i === 0 ? $('.leader') : rowFor(p.name);
    if (!el) return;
    if (live.first) {
      if (i > 0) { el.style.animationDelay = `${i * 70}ms`; el.classList.add('row-in'); }
    } else {
      const was = live.ranks[p.name];
      if (was !== undefined && was !== i) bump(el, was > i ? 'rank-up' : 'rank-down');
      if (live.scores[p.name] !== undefined && live.scores[p.name] !== p.totalScore) {
        bump(i === 0 ? $('#leadScore') : el.querySelector('.score'), 'pop');
      }
    }
  });

  live.ranks = Object.fromEntries(players.map((p, i) => [p.name, i]));
  live.scores = Object.fromEntries(players.map(p => [p.name, p.totalScore]));
  renderChart(players, histories, live.first);
  live.first = false;
});

$('#shareBtn').addEventListener('click', async () => {
  try {
    if (navigator.share) await navigator.share({ title: 'BoardGameBaji', url: SHARE_URL });
    else { await navigator.clipboard.writeText(SHARE_URL); toast('Link copied'); }
  } catch (e) { /* dismissed */ }
});

/* ═════════════ HOST ═════════════ */
let hostUser = null;
let currentGame = null;

onAuthStateChanged(auth, user => {
  hostUser = user;
  store.admin = !!(user && user.email === DELETE_ADMIN);
  renderHistory(); renderPlayers();
  $('#loginForm').hidden = !!user;
  $('#hostApp').hidden = !user;
  $('#hostUser').textContent = user ? user.email : '';
  if (user) {
    watchSuggestions();
    syncHost();
  }
});

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try {
    await signInWithEmailAndPassword(auth, $('#loginEmail').value.trim(), $('#loginPassword').value);
    $('#loginPassword').value = '';
  } catch (err) { $('#loginError').textContent = 'Invalid email or password.'; }
});
$('#signOutBtn').addEventListener('click', () => signOut(auth));

/* suggestion chips (known games / players) */
const known = { games: [], players: [] };
let watching = false;
const draft = [];

function watchSuggestions() {
  if (watching) return;
  watching = true;
  onValue(ref(db, 'gameHistory'), s => {
    const seen = new Set();
    known.games = Object.values(s.val() || {})
      .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0)).map(g => g.gameName)
      .filter(n => n && !seen.has(n) && seen.add(n)).slice(0, 5);
    renderGameChips();
  });
  onValue(ref(db, 'playerRecords'), s => {
    known.players = Object.values(s.val() || {})
      .map(p => ({ name: p.name, last: Object.values(p.games || {}).reduce((m, g) => Math.max(m, g.endedAt || 0), 0) }))
      .sort((a, b) => b.last - a.last).map(p => p.name).slice(0, 5);
    renderPlayerChips();
  });
}

function renderGameChips() {
  const v = $('#gameName').value.trim();
  $('#gameChips').innerHTML = known.games.map(n => `<button type="button" class="chip ${n === v ? 'on' : ''}" data-v="${esc(n)}">${esc(n)}</button>`).join('');
}
function renderPlayerChips() {
  $('#playerChips').innerHTML = known.players.map(n => `<button type="button" class="chip ${draft.includes(n) ? 'on' : ''}" data-v="${esc(n)}">${esc(n)}</button>`).join('');
  $('#playerTokens').innerHTML = draft.map((n, i) => `<span class="token">${esc(n)}<button type="button" data-i="${i}" aria-label="Remove ${esc(n)}">${icon('x')}</button></span>`).join('');
}
$('#gameChips').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  $('#gameName').value = c.dataset.v; renderGameChips();
});
$('#gameName').addEventListener('input', renderGameChips);
$('#playerChips').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  const i = draft.indexOf(c.dataset.v);
  if (i < 0) draft.push(c.dataset.v); else draft.splice(i, 1);
  renderPlayerChips();
});
$('#playerTokens').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  draft.splice(+b.dataset.i, 1); renderPlayerChips();
});
function addTypedPlayers() {
  const inp = $('#playerInput');
  inp.value.split(',').map(s => s.trim()).filter(Boolean).forEach(n => { if (!draft.includes(n)) draft.push(n); });
  inp.value = ''; renderPlayerChips();
}
$('#addPlayerBtn').addEventListener('click', addTypedPlayers);
$('#playerInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTypedPlayers(); } });
$('#gameName').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#playerInput').focus(); } });

function resetDraft() {
  $('#gameName').value = ''; draft.length = 0; renderGameChips(); renderPlayerChips();
}

/* start game — same document shape as before */
$('#startBtn').addEventListener('click', async () => {
  addTypedPlayers();
  const gameName = $('#gameName').value.trim();
  if (!gameName) { toast('Name the game first'); $('#gameName').focus(); return; }
  if (!draft.length) { toast('Add at least one player'); $('#playerInput').focus(); return; }
  const rankingOrder = $('input[name=rankingOrder]:checked').value;
  const players = {};
  draft.forEach((name, i) => { players[`player_${i}`] = { name, totalScore: 0, history: [] }; });
  await set(gameRef, { gameStatus: 'active', gameName, rankingOrder, players, startedAt: Date.now() });
  resetDraft();
});

/* live host view */
onValue(gameRef, s => { currentGame = s.val(); syncHost(); });

function syncHost() {
  if (!hostUser) return;
  const active = currentGame && currentGame.gameStatus === 'active';
  $('#newGame').hidden = !!active;
  $('#activeGame').hidden = !active;
  if (!active) { $('#playersContainer').innerHTML = ''; return; }

  $('#hostGameTitle').textContent = currentGame.gameName;
  $('#hostMode').textContent = currentGame.rankingOrder === 'lowest' ? 'Lowest score wins' : 'Highest score wins';
  const box = $('#playersContainer');
  const ids = Object.keys(currentGame.players || {});
  $$('.score-card', box).forEach(c => { if (!ids.includes(c.dataset.id)) c.remove(); });

  ids.forEach(id => {
    const p = currentGame.players[id];
    const hist = norm(p.history);
    let card = $(`.score-card[data-id="${CSS.escape(id)}"]`, box);
    if (!card) {
      card = document.createElement('div');
      card.className = 'score-card';
      card.dataset.id = id;
      card.innerHTML = `
        <div class="score-top"><span class="score-name"></span><span class="score-total"></span></div>
        <div class="entry">
          <input type="text" inputmode="numeric" pattern="-?[0-9]*" enterkeyhint="next" placeholder="Score" aria-label="Score for round" autocomplete="off">
          <button type="button" class="add" aria-label="Add score">${icon('check')}</button>
          <button type="button" class="undo" aria-label="Undo last score">${icon('undo')}</button>
        </div>
        <div class="rounds"></div>`;
      box.appendChild(card);
    }
    card.querySelector('.score-name').textContent = p.name;
    card.querySelector('.score-total').textContent = p.totalScore || 0;
    card.querySelector('.rounds').innerHTML = hist.length
      ? hist.map((v, i) => `<span>R${i + 1} <b>${v}</b></span>`).join('')
      : '<span>No scores yet</span>';
    const rounds = card.querySelector('.rounds');
    rounds.scrollLeft = rounds.scrollWidth;
  });
}

/* score entry (event delegation so cards can be updated in place) */
const playersBox = $('#playersContainer');
playersBox.addEventListener('input', e => {
  if (e.target.matches('input')) {
    const neg = e.target.value.trim().startsWith('-');
    e.target.value = (neg ? '-' : '') + e.target.value.replace(/[^0-9]/g, '');
  }
});
playersBox.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('input')) addScore(e.target.closest('.score-card'));
});
playersBox.addEventListener('click', e => {
  const card = e.target.closest('.score-card'); if (!card) return;
  if (e.target.closest('.add')) addScore(card);
  else if (e.target.closest('.undo')) undoScore(card);
});

async function addScore(card) {
  const inp = card.querySelector('input');
  const n = parseInt(inp.value, 10);
  if (isNaN(n)) return;
  const pRef = ref(db, `currentGame/players/${card.dataset.id}`);
  const p = (await get(pRef)).val();
  if (!p) return;
  const h = norm(p.history);
  h.push(n);
  await set(pRef, { ...p, history: h, totalScore: (p.totalScore || 0) + n });
  inp.value = '';
  const next = card.nextElementSibling;
  if (next) next.querySelector('input').focus(); else inp.blur();
}

async function undoScore(card) {
  const pRef = ref(db, `currentGame/players/${card.dataset.id}`);
  const p = (await get(pRef)).val();
  const h = norm(p && p.history);
  if (!h.length) { toast('Nothing to undo'); return; }
  const last = h.pop();
  await set(pRef, { ...p, history: h, totalScore: (p.totalScore || 0) - last });
  toast(`Removed ${last} from ${p.name}`);
}

/* sheet */
const openSheet = () => { scrim.hidden = $('#moreSheet').hidden = false; scrimAction = closeSheet; };
const closeSheet = () => { scrim.hidden = $('#moreSheet').hidden = true; scrimAction = null; };
$('#moreBtn').addEventListener('click', openSheet);
$('#sheetClose').addEventListener('click', closeSheet);

$('#resetBtn').addEventListener('click', async () => {
  closeSheet();
  if (!await confirmAsk({ title: 'Reset all scores?', msg: 'Every player goes back to 0 and rounds are cleared.', ok: 'Reset', danger: true })) return;
  const data = (await get(gameRef)).val();
  Object.values(data.players).forEach(p => { p.totalScore = 0; p.history = []; });
  await set(gameRef, data);
  toast('Scores reset');
});

$('#abandonBtn').addEventListener('click', async () => {
  closeSheet();
  if (!await confirmAsk({ title: 'Abandon this game?', msg: 'It will not be saved to history.', ok: 'Abandon', danger: true })) return;
  await set(gameRef, { gameStatus: 'ended' });
  resetDraft();
});

/* end & save — identical writes to the original app */
$('#endBtn').addEventListener('click', async () => {
  if (!await confirmAsk({ title: 'End and save?', msg: 'Final scores go to history and player records.', ok: 'End & save' })) return;
  const data = (await get(gameRef)).val();
  if (!data || data.gameStatus !== 'active') return;
  const endedAt = Date.now();
  const lowest = data.rankingOrder === 'lowest';
  const winnerLabel = lowest ? 'Lowest Score Wins' : 'Highest Score Wins';
  const ranked = Object.values(data.players)
    .sort((a, b) => lowest ? a.totalScore - b.totalScore : b.totalScore - a.totalScore)
    .map((p, i) => ({ name: p.name, totalScore: p.totalScore, rank: i + 1, won: i === 0, history: norm(p.history) }));

  const newRef = push(ref(db, 'gameHistory'));
  const gameId = newRef.key;
  await set(newRef, { gameName: data.gameName, rankingOrder: data.rankingOrder, winnerLabel, endedAt, players: ranked });

  for (const rp of ranked) {
    const prRef = ref(db, `playerRecords/${sanitizeKey(rp.name)}`);
    const rec = (await get(prRef)).val() || { name: rp.name, games: {} };
    rec.name = rp.name;
    rec.games = rec.games || {};
    rec.games[gameId] = {
      gameName: data.gameName, score: rp.totalScore, rank: rp.rank, won: rp.won,
      winnerLabel, totalPlayers: ranked.length, endedAt, roundHistory: rp.history
    };
    await set(prRef, rec);
  }
  await set(gameRef, { gameStatus: 'ended' });
  resetDraft();
  toast('Game saved to history');
});

/* pause & resume */
$('#pauseBtn').addEventListener('click', async () => {
  if (!await confirmAsk({ title: 'Pause this game?', msg: 'You can resume it later from the Host tab.', ok: 'Pause' })) return;
  const data = (await get(gameRef)).val();
  if (!data || data.gameStatus !== 'active') return;
  await set(push(pausedRef), { ...data, pausedAt: Date.now() });
  await set(gameRef, { gameStatus: 'ended' });
  resetDraft();
});

onValue(pausedRef, s => {
  const data = s.val();
  const entries = Object.entries(data || {}).sort((a, b) => (b[1].pausedAt || 0) - (a[1].pausedAt || 0));
  $('#pausedCard').hidden = !entries.length;
  const list = $('#pausedList');
  list.innerHTML = entries.map(([id, g]) => `
    <div class="paused-item" data-id="${esc(id)}">
      <div class="info"><b>${esc(g.gameName || 'Untitled')}</b><span class="muted small">${esc(Object.values(g.players || {}).map(p => p.name).join(', '))}</span></div>
      <button class="btn primary resume">${icon('play')}Resume</button>
      <button class="btn icon-only drop" aria-label="Discard paused game">${icon('x')}</button>
    </div>`).join('');
  list.onclick = async e => {
    const item = e.target.closest('.paused-item'); if (!item) return;
    const id = item.dataset.id, g = data[id];
    if (e.target.closest('.resume')) {
      const live_ = (await get(gameRef)).val();
      if (live_ && live_.gameStatus === 'active') {
        if (!await confirmAsk({ title: 'Switch games?', msg: 'The live game will be paused and this one resumed.', ok: 'Switch' })) return;
        await set(push(pausedRef), { ...live_, pausedAt: Date.now() });
      }
      const { pausedAt, ...rest } = g;
      await set(gameRef, { ...rest, gameStatus: 'active' });
      await set(ref(db, `pausedGames/${id}`), null);
    } else if (e.target.closest('.drop')) {
      if (!await confirmAsk({ title: `Discard "${g.gameName}"?`, msg: 'This paused game will not be saved.', ok: 'Discard', danger: true })) return;
      await set(ref(db, `pausedGames/${id}`), null);
    }
  };
});

if (IS_MOCK) $('.brand-name').textContent = 'BoardGameBaji · mock';


/* ═════════════ HISTORY ═════════════ */
const fmtDate = ts => ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const fmtDateTime = ts => ts ? `${fmtDate(ts)}, ${new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const openGames = new Set();

onValue(ref(db, 'gameHistory'), s => {
  store.games = Object.entries(s.val() || {}).map(([id, g]) => ({ id, ...g })).sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
  renderHistory();
});
$('#gameSearch').addEventListener('input', renderHistory);

function renderHistory() {
  const q = $('#gameSearch').value.trim().toLowerCase();
  const games = store.games.filter(g => !q || (g.gameName || '').toLowerCase().includes(q) || norm(g.players).some(p => (p.name || '').toLowerCase().includes(q)));
  $('#historyCount').textContent = store.games.length ? plural(store.games.length, 'game') : '';
  $('#historyList').innerHTML = games.length ? games.map(gameCard).join('') :
    `<div class="empty">${store.games.length ? 'No games match your search.' : 'No finished games yet. End a game from the Host tab to save it here.'}</div>`;
}

function gameCard(g) {
  const players = norm(g.players).sort((a, b) => a.rank - b.rank);
  const open = openGames.has(g.id);
  const lowest = g.rankingOrder === 'lowest';
  const ch = chartMarkup(players, players.map(p => norm(p.history)));
  return `
  <article class="game-card ${open ? 'open' : ''}" data-id="${esc(g.id)}">
    <button class="hd" aria-expanded="${open}">
      <div class="hd-main">
        <div class="t">${esc(g.gameName || 'Untitled')}</div>
        <div class="sub">${fmtDateTime(g.endedAt)} · ${plural(players.length, 'player')}</div>
        <div class="podium">${players.slice(0, 3).map(p => `<span class="medal"><span class="disc r${p.rank}">${p.rank}</span>${esc(p.name)}</span>`).join('')}</div>
      </div>
      <span class="chev">${icon('chevron')}</span>
    </button>
    <div class="bd">
      <p class="eyebrow" style="margin-bottom:6px">${lowest ? 'Lowest score won' : 'Highest score won'}</p>
      ${players.map((p, i) => {
        const rs = norm(p.history);
        return `
        <div class="rank-line">
          <span class="disc r${p.rank}">${p.rank}</span>
          <span class="nm"><i style="background:${COLORS[i % 8]}"></i>${esc(p.name)}</span>
          ${p.won ? '<span class="tag">Winner</span>' : '<span></span>'}
          <span class="pts">${p.totalScore}</span>
        </div>
        ${rs.length ? `<div class="rounds wrap rl">${rs.map((v, r) => `<span>R${r + 1} <b>${v}</b></span>`).join('')}</div>` : ''}`;
      }).join('')}
      ${ch ? chartBlock(ch) : ''}
      ${store.admin ? `<button class="danger-link del-game">${icon('trash')}Delete game</button>` : ''}
    </div>
  </article>`;
}

$('#historyList').addEventListener('click', async e => {
  const card = e.target.closest('.game-card'); if (!card) return;
  const id = card.dataset.id;
  if (e.target.closest('.del-game')) {
    const g = store.games.find(x => x.id === id);
    if (!g || !await confirmAsk({ title: `Delete "${g.gameName}"?`, msg: "Removed from history and every player's record. This cannot be undone.", ok: 'Delete', danger: true })) return;
    await Promise.all(norm(g.players).map(p => set(ref(db, `playerRecords/${sanitizeKey(p.name)}/games/${id}`), null)));
    await set(ref(db, `gameHistory/${id}`), null);
    toast('Game deleted');
  } else if (e.target.closest('.hd')) {
    const open = card.classList.toggle('open');
    card.querySelector('.hd').setAttribute('aria-expanded', open);
    if (open) openGames.add(id); else openGames.delete(id);
  }
});

/* ═════════════ PLAYERS ═════════════ */
const ACH = [
  { i: 'trophy', n: 'First Victory', d: 'Won a game', ok: s => s.wins >= 1 },
  { i: 'medal', n: 'High Roller', d: 'Won 5 games', ok: s => s.wins >= 5 },
  { i: 'crown', n: 'Champion', d: 'Won 10 games', ok: s => s.wins >= 10 },
  { i: 'flame', n: 'Hat Trick', d: '3 wins in a row', ok: s => s.streak >= 3 },
  { i: 'bolt', n: 'Unstoppable', d: '5 wins in a row', ok: s => s.streak >= 5 },
  { i: 'gem', n: 'Titan', d: '10 wins in a row', ok: s => s.streak >= 10 },
  { i: 'target', n: 'Sharp Shooter', d: '75%+ win rate, 5+ games', ok: s => s.total >= 5 && s.rate >= 75 },
  { i: 'shield', n: 'Veteran', d: 'Played 25 games', ok: s => s.total >= 25 },
  { i: 'flag', n: 'Marathon', d: 'Played 50 games', ok: s => s.total >= 50 },
  { i: 'medal', n: 'Podium Regular', d: 'Top 3 in 15 games', ok: s => s.podiums >= 15 },
  { i: 'live', n: 'Century Club', d: '1000+ total points', ok: s => s.pts >= 1000 },
  { i: 'star', n: 'Elite', d: '90%+ win rate, 10+ games', ok: s => s.total >= 10 && s.rate >= 90 }
];

function statsOf(rec) {
  const games = Object.entries(rec.games || {}).map(([id, g]) => ({ id, ...g })).sort((a, b) => (a.endedAt || 0) - (b.endedAt || 0));
  const total = games.length, wins = games.filter(g => g.won).length;
  let run = 0, streak = 0;
  games.forEach(g => { run = g.won ? run + 1 : 0; streak = Math.max(streak, run); });
  const pts = games.reduce((n, g) => n + (g.score || 0), 0);
  return {
    games, total, wins, streak, pts,
    rate: total ? Math.round(wins / total * 100) : 0,
    avg: total ? Math.round(pts / total) : 0,
    best: games.reduce((m, g) => Math.max(m, g.score || 0), 0),
    podiums: games.filter(g => g.rank <= 3).length
  };
}

onValue(ref(db, 'playerRecords'), s => {
  store.players = Object.entries(s.val() || {}).map(([key, r]) => ({ key, name: r.name || key, st: statsOf(r) }));
  renderPlayers();
  if (pendingProfile) openPendingProfile();
});
$('#playerSearch').addEventListener('input', renderPlayers);
$$('input[name=sort]').forEach(r => r.addEventListener('change', renderPlayers));

function renderPlayers() {
  const sort = $('input[name=sort]:checked').value;
  const q = $('#playerSearch').value.trim().toLowerCase();
  const by = {
    wins: (a, b) => b.st.wins - a.st.wins || b.st.rate - a.st.rate,
    winrate: (a, b) => b.st.rate - a.st.rate || b.st.wins - a.st.wins,
    games: (a, b) => b.st.total - a.st.total || b.st.wins - a.st.wins,
    name: (a, b) => a.name.localeCompare(b.name)
  }[sort];
  const list = [...store.players].sort(by).filter(p => !q || p.name.toLowerCase().includes(q));
  $('#playersCount').textContent = store.players.length ? plural(store.players.length, 'player') : '';
  $('#playersList').innerHTML = list.length ? list.map((p, i) => {
    const big = { wins: [p.st.wins, 'wins'], winrate: [p.st.rate + '%', 'win rate'], games: [p.st.total, 'games'], name: [p.st.wins, 'wins'] }[sort];
    return `<button class="p-card ${i === 0 && sort !== 'name' ? 't1' : ''}" data-key="${esc(p.key)}">
      <span class="pos">${sort === 'name' ? '' : i + 1}</span>
      <span><div class="nm">${esc(p.name)}</div><div class="st">${plural(p.st.total, 'game')} · ${p.st.wins} won · ${p.st.rate}%</div></span>
      <span class="big">${big[0]}<small>${big[1]}</small></span>
    </button>`;
  }).join('') : `<div class="empty">${store.players.length ? 'No players match your search.' : 'No player records yet. Finish a game to start the leaderboard.'}</div>`;
}

$('#playersList').addEventListener('click', e => {
  const c = e.target.closest('.p-card'); if (!c) return;
  location.hash = '#players/' + encodeURIComponent(c.dataset.key);
});

function openPendingProfile() {
  const p = store.players.find(x => x.key === pendingProfile);
  if (!p) return;                       /* wait for data, or unknown key */
  const st = p.st;
  const first = st.games[0];
  $('#profileBody').innerHTML = `
    <div class="prof-head"><p class="eyebrow">${first ? 'Playing since ' + fmtDate(first.endedAt) : 'No games yet'}</p><h2>${esc(p.name)}</h2></div>
    <div class="stat-grid">
      <div class="stat"><b>${st.total}</b><span>Games</span></div>
      <div class="stat"><b>${st.wins}</b><span>Wins</span></div>
      <div class="stat"><b>${st.rate}%</b><span>Win rate</span></div>
      <div class="stat"><b>${st.avg}</b><span>Avg score</span></div>
      <div class="stat"><b>${st.best}</b><span>Best</span></div>
      <div class="stat"><b>${st.streak}</b><span>Best streak</span></div>
    </div>
    <h3 class="sec-title">Achievements</h3>
    <div class="ach-grid">${ACH.map(a => `<div class="ach ${a.ok(st) ? 'on' : ''}">${icon(a.i)}<div><b>${a.n}</b><small>${a.d}</small></div></div>`).join('')}</div>
    <h3 class="sec-title">Games</h3>
    ${st.games.length ? [...st.games].reverse().map(g => profileGame(g, p.name)).join('') : '<p class="muted">Nothing played yet.</p>'}
    ${store.admin ? `<button class="danger-link" id="delPlayer" data-key="${esc(p.key)}">${icon('trash')}Delete player</button>` : ''}`;
  const fresh = $('#profile').hidden;
  $('#profile').hidden = scrim.hidden = false;
  if (fresh) $('#profile').scrollTop = 0;
  scrimAction = () => { location.hash = '#players'; };
}

function closeProfile() {
  if ($('#profile').hidden) return;
  $('#profile').hidden = true;
  scrim.hidden = true;
  scrimAction = null;
}
$('#profileClose').addEventListener('click', () => { location.hash = '#players'; });
$('#profileBody').addEventListener('click', async e => {
  const b = e.target.closest('#delPlayer'); if (!b) return;
  const p = store.players.find(x => x.key === b.dataset.key);
  if (!p || !await confirmAsk({ title: `Delete "${p.name}"?`, msg: 'All stats and game records for this player are removed. This cannot be undone.', ok: 'Delete', danger: true })) return;
  location.hash = '#players';
  await set(ref(db, `playerRecords/${p.key}`), null);
  toast('Player deleted');
});

/* profile → game accordion */
let profileGameOpen = null;

function profileGame(g, name) {
  const open = profileGameOpen === g.id;
  return `
  <div class="g-item ${open ? 'open' : ''}" data-id="${esc(g.id)}">
    <button class="g-line" aria-expanded="${open}">
      <span class="a">${esc(g.gameName || '—')} ${g.won ? '<span class="tag">Won</span>' : ''}</span>
      <span class="b">${g.score} pts <span class="chev">${icon('chevron')}</span></span>
      <span class="c">#${g.rank} of ${g.totalPlayers} · ${fmtDate(g.endedAt)}</span>
    </button>
    <div class="g-detail">${open ? gameDetail(g, name) : ''}</div>
  </div>`;
}

function gameDetail(g, name) {
  const full = store.games.find(x => x.id === g.id);
  const players = full ? norm(full.players).sort((a, b) => a.rank - b.rank) : null;
  const me = players ? players.findIndex(p => p.name === name) : -1;
  const mine = me >= 0 ? norm(players[me].history) : norm(g.roundHistory);
  const lowest = full && full.rankingOrder === 'lowest';
  const best = mine.length ? (lowest ? Math.min(...mine) : Math.max(...mine)) : null;
  const sum = mine.reduce((n, v) => n + (v || 0), 0);
  let out = `<p class="eyebrow" style="margin:2px 0 8px">${full ? (lowest ? 'Lowest score won' : 'Highest score won') : 'Game details'}${full ? ' · ' + fmtDateTime(full.endedAt) : ''}</p>`;
  if (mine.length) {
    out += `<div class="mini-stats">
      <div><b>#${g.rank}</b><span>Finish</span></div>
      <div><b>${g.score}</b><span>Total</span></div>
      <div><b>${best}</b><span>Best round</span></div>
      <div><b>${(sum / mine.length).toFixed(1)}</b><span>Avg round</span></div>
    </div>
    <div class="rounds wrap">${mine.map((v, i) => `<span class="${v === best ? 'best' : ''}">R${i + 1} <b>${v}</b></span>`).join('')}</div>`;
  }
  if (players) {
    out += players.map((p, i) => `
      <div class="rank-line ${i === me ? 'me' : ''}">
        <span class="disc r${p.rank}">${p.rank}</span>
        <span class="nm"><i style="background:${COLORS[i % 8]}"></i>${esc(p.name)}${i === me ? ' <em>you</em>' : ''}</span>
        ${p.won ? '<span class="tag">Winner</span>' : '<span></span>'}
        <span class="pts">${p.totalScore}</span>
      </div>`).join('');
    const ch = chartMarkup(players, players.map(p => norm(p.history)), me);
    if (ch) out += chartBlock(ch);
  } else {
    out += '<p class="muted small" style="margin-top:10px">Full game record is no longer in history.</p>';
  }
  return out;
}

$('#profileBody').addEventListener('click', e => {
  const hd = e.target.closest('.g-line'); if (!hd) return;
  const item = hd.closest('.g-item');
  const id = item.dataset.id;
  profileGameOpen = profileGameOpen === id ? null : id;
  openPendingProfile();
  const el = $(`.g-item[data-id="${CSS.escape(id)}"]`, $('#profileBody'));
  if (profileGameOpen && el) {
    const sheet = $('#profile');
    sheet.scrollTo({ top: Math.max(0, el.offsetTop - sheet.offsetTop - 12), behavior: 'smooth' });
  }
});
