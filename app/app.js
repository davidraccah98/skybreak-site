// Skybreak demo: the whole system (account, training, contests, checks, scoring, prizes) simulated in the browser.
// Thresholds are the real ones from the v2 catalog; games, other players and Riot checks are simulated.
'use strict';
const D = window.SKY;
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const LEVELS = ['easy', 'medium', 'hard'];
const LEVEL_Q = { easy: 0.40, medium: 0.65, hard: 0.85 }; // the share of games below each line (60/35/15% reach it)
const POINTS = { easy: D.levels.easy.points, medium: D.levels.medium.points, hard: D.levels.hard.points };
const ROLES = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', BOTTOM: 'Bot', UTILITY: 'Support' };
const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const tierName = (t) => t[0] + t.slice(1).toLowerCase();
const CH = Object.fromEntries(D.challenges.map((c) => [c.id, c]));
const PRIZE_X = [2, 1.7, 1.5, 1.2, 1, 1, 1, 1, 1, 1, 1, 1, 0.8, 0.8, 0, 0, 0, 0, 0, 0];
const SEATS = 20;
const CONTEST_TYPES = [
  { ticket: 0, name: 'Free contest', blurb: 'No ticket, no prizes: the leaderboard and the bragging rights.' },
  { ticket: 200, name: 'Contest · 2 €', blurb: '20 players, 80% of tickets back as prizes.' },
  { ticket: 500, name: 'Contest · 5 €', blurb: '20 players, 1st place doubles the ticket.' },
];
const HOUR = 3600e3;
const DAY = 24 * HOUR;

// ---------- state (kept only in this browser) ----------
const KEY = 'skybreak-demo-v1';
let S;
function fresh() {
  return { account: null, balance: 1500, now: Date.now(), lastDaily: Date.now(), signups: [], games: [], contests: {}, seq: 1, seeded: false, trainingStats: {} };
}
function load() {
  try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { S = fresh(); }
  if (!S.contests) S = fresh();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: the demo still works until reload */ } }
const uid = (p) => `${p}${S.seq++}`;

// ---------- random (seeded, so a check is reproducible within a session) ----------
let seed = (Date.now() % 2147483647) || 7;
const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

// ---------- catalog helpers ----------
const pairKeys = Object.keys(D.pairs).sort((a, b) => D.champions[a.split('|')[1]].localeCompare(D.champions[b.split('|')[1]]));
const splitPair = (k) => { const [role, champ] = k.split('|'); return { role, champ }; };
const champName = (c) => D.champions[c] || c;
const icon = (c, cls = 'champ') => `<img class="${cls}" alt="" loading="lazy" src="https://ddragon.leagueoflegends.com/cdn/${D.ddragon}/img/champion/${c}.png" onerror="this.style.visibility='hidden'">`;
const pairLabel = (k) => { const { role, champ } = splitPair(k); return `${champName(champ)} ${ROLES[role]}`; };
const offersOf = (pair) => D.pairs[pair] || {};
function lineOf(pair, id, level, win) {
  const v = (offersOf(pair)[id] || [])[LEVELS.indexOf(level)];
  if (v == null) return null;
  return Array.isArray(v) ? (win ? v[0] : v[1]) : v;
}
const isCount = (id) => CH[id].format === 'count';
/** The lines of a challenge for a pair, at the three levels, with a guess for levels not offered (used only to simulate). */
function anchors(pair, id, win) {
  const known = LEVELS.map((l) => [LEVEL_Q[l], lineOf(pair, id, l, win)]).filter(([, v]) => v != null);
  let slope;
  if (known.length >= 2) slope = (known[known.length - 1][1] - known[0][1]) / (known[known.length - 1][0] - known[0][0]);
  else slope = isCount(id) ? 4 : Math.max(Math.abs(known[0][1]) * 1.2, 0.05);
  return { known, slope };
}
/** Value at quantile u (0..1) of the pair's distribution: piecewise linear through the known lines. */
function valueAt(pair, id, win, u) {
  const { known, slope } = anchors(pair, id, win);
  let v;
  if (u <= known[0][0]) v = known[0][1] - (known[0][0] - u) * slope;
  else if (u >= known[known.length - 1][0]) v = known[known.length - 1][1] + (u - known[known.length - 1][0]) * slope;
  else {
    for (let i = 0; i < known.length - 1; i++) {
      const [q0, v0] = known[i], [q1, v1] = known[i + 1];
      if (u >= q0 && u <= q1) v = v0 + ((u - q0) / (q1 - q0)) * (v1 - v0);
    }
  }
  if (isCount(id)) v = Math.round(v);
  if (CH[id].format === 'amount') v = Math.max(300, v);
  if (CH[id].format === 'percent' || CH[id].format === 'share-max') v = Math.max(CH[id].format === 'share-max' ? -1 : 0, Math.min(CH[id].format === 'share-max' ? 0 : 1, v));
  return v;
}
/** The line below the chosen level: points start growing from it (window scoring). */
function lowLine(pair, id, level, win) {
  const hi = lineOf(pair, id, level, win);
  const i = LEVELS.indexOf(level);
  const below = i > 0 ? lineOf(pair, id, LEVELS[i - 1], win) : null;
  if (below != null && below < hi) return below;
  const q = i > 0 ? LEVEL_Q[LEVELS[i - 1]] : 0.15;
  return valueAt(pair, id, win, q) < hi ? valueAt(pair, id, win, q) : hi - (isCount(id) ? 1 : Math.abs(hi) * 0.2 || 0.05);
}
function score(pair, pick, value, win) {
  const hi = lineOf(pair, pick.id, pick.level, win);
  const lo = lowLine(pair, pick.id, pick.level, win);
  const full = value >= hi;
  const frac = full ? 1 : Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return { hi, lo, full, frac, points: Math.round(frac * POINTS[pick.level] * 10) / 10 };
}
function fmt(id, v) {
  if (v == null) return '—';
  const f = CH[id].format;
  if (id === 'multikill') return ['—', 'single', 'double', 'triple', 'quadra', 'penta'][Math.max(0, Math.min(5, v))] || String(v);
  if (f === 'percent') return `${Math.round(v * 100)}%`;
  if (f === 'share-max') return `${Math.round(Math.abs(v) * 100)}%`;
  if (f === 'advantage') return `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  if (f === 'count') return `${v >= 0 ? '+' : ''}${v}`;
  if (f === 'amount') return v >= 999999 ? 'no deaths' : `${Math.round(v / 100) * 100}`;
  return String(v);
}
function yValue(pair, id, key, x) {
  const src = (D.ySources[id] || {})[key];
  if (!src) return null;
  const t = (D.typical.pairs[pair] || D.typical.roles[splitPair(pair).role] || {})[src];
  if (t == null) return null;
  const y = Math.abs(x) * t;
  return y >= 1000 ? `${Math.round(y / 100) * 100}` : `${Math.round(y)}`;
}
function challengeText(pair, id, level) {
  const c = CH[id];
  const v = (offersOf(pair)[id] || [])[LEVELS.indexOf(level)];
  const x = Array.isArray(v) ? v[0] : v;
  const xl = Array.isArray(v) ? v[1] : v;
  return c.text
    .replace('{x}', `<b>${fmt(id, x)}</b>`).replace('{xl}', `<b>${fmt(id, xl)}</b>`)
    .replace('{y10}', yValue(pair, id, 'y10', x) ?? '—').replace('{y20}', yValue(pair, id, 'y20', x) ?? '—').replace('{y30}', yValue(pair, id, 'y30', x) ?? '—');
}
const euro = (c) => `${(c / 100).toFixed(c % 100 ? 2 : 0).replace('.', ',')} €`;
const when = (t) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// ---------- simulated other players ----------
const NAMES = ['Nightglass', 'Kaeru', 'Velmora', 'Tidecaller', 'Ashfang', 'Lumen', 'Orrin', 'Sablewing', 'Quietstorm', 'Brisa', 'Halcyon', 'Mirelle', 'Jotun', 'Pyrelight', 'Zephra', 'Tamsin', 'Coldiron', 'Wren', 'Saffi', 'Ondine', 'Brokenhalo', 'Grimsby', 'Kestrel', 'Novaline', 'Riven Main', 'Thistle', 'Umbral', 'Vesper', 'Yarrow', 'Fenwick'];
function randomPicks(pair) {
  const offers = Object.entries(offersOf(pair)).flatMap(([id, lv]) => lv.map((v, i) => (v == null ? null : { id, level: LEVELS[i] })).filter(Boolean));
  const out = [];
  while (out.length < 3 && offers.length) {
    const o = offers.splice(Math.floor(rnd() * offers.length), 1)[0];
    if (!out.some((p) => p.id === o.id)) out.push(o);
  }
  return out;
}
function playGame(pair, picks, skill = 0) {
  const win = rnd() < 0.5;
  const minutes = Math.round(22 + rnd() * 16);
  const results = picks.map((p) => {
    const u = Math.max(0.001, Math.min(0.999, rnd() + skill + gauss() * 0.03));
    const value = valueAt(pair, p.id, win, u);
    return { ...p, value, ...score(pair, p, value, win) };
  });
  return { win, minutes, results, total: Math.round(results.reduce((a, r) => a + r.points, 0) * 10) / 10 };
}
function botEntry(ticket, at) {
  const pair = pick(pairKeys);
  const picks = randomPicks(pair);
  const g = playGame(pair, picks, (rnd() - 0.5) * 0.1);
  return { name: `${pick(NAMES)}#${String(Math.floor(rnd() * 900) + 100)}`, tier: pick(TIERS), pair, at, ...g, you: false };
}
function newContest(ticket, at) {
  const id = uid('C');
  S.contests[id] = { id, ticket, createdAt: at, state: 'open', entries: [] };
  return S.contests[id];
}
function seedContests() {
  if (S.seeded) return;
  for (const t of CONTEST_TYPES) {
    for (let k = 0; k < 2; k++) {
      const c = newContest(t.ticket, S.now - (k + 1) * 5 * HOUR);
      const n = 6 + Math.floor(rnd() * 9);
      for (let i = 0; i < n; i++) c.entries.push(botEntry(t.ticket, c.createdAt + i * 20 * 60e3));
    }
  }
  S.seeded = true;
}
function settle(c) {
  const ranked = [...c.entries].sort((a, b) => b.total - a.total || a.at - b.at);
  const pool = c.ticket * SEATS * 0.8;
  // ties: the players on the same points share the prizes of the places they hold
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j + 1 < ranked.length && ranked[j + 1].total === ranked[i].total) j++;
    const sum = PRIZE_X.slice(i, j + 1).reduce((a, x) => a + x * c.ticket, 0);
    for (let k = i; k <= j; k++) { ranked[k].place = i + 1; ranked[k].prize = Math.round(sum / (j - i + 1)); }
    i = j + 1;
  }
  c.entries = ranked;
  c.state = 'done';
  c.pool = pool;
  const me = ranked.find((e) => e.you);
  if (me && me.prize) { S.balance += me.prize; toast(`Contest finished: you placed ${me.place}° and won ${euro(me.prize)}.`); }
  else if (me) toast(`Contest finished: you placed ${me.place}°.`);
}
function addEntry(c, e) {
  c.entries.push(e);
  if (c.entries.length >= SEATS) settle(c);
}
function botsArrive(hours) {
  for (const c of Object.values(S.contests)) {
    if (c.state !== 'open') continue;
    const n = Math.min(SEATS - c.entries.length, Math.floor(rnd() * 2 + hours * (0.25 + rnd() * 0.4)));
    for (let i = 0; i < n && c.state === 'open'; i++) addEntry(c, botEntry(c.ticket, S.now - rnd() * hours * HOUR));
  }
  for (const t of CONTEST_TYPES) if (!Object.values(S.contests).some((c) => c.ticket === t.ticket && c.state === 'open')) newContest(t.ticket, S.now);
}

// ---------- the check ----------
/** Simulates the games the player played since the last check, then applies the rules exactly as the real check will. */
function runCheck({ daily }) {
  const from = S.lastCheck || S.now - HOUR;
  const elapsed = daily ? DAY : 2 * HOUR + rnd() * 4 * HOUR;
  S.now += elapsed;
  const to = S.now;
  const found = [];
  const active = S.signups.filter((s) => s.status === 'waiting' || s.status === 'leaving');
  // games with the locked pairs (the player usually plays them), plus other games that do not count
  for (const s of active) {
    if (rnd() < (daily ? 0.75 : 0.6)) {
      const limit = s.status === 'leaving' ? s.leaveAt : to;
      const start = Math.max(s.at, from) + rnd() * Math.max(0, limit - Math.max(s.at, from));
      if (start < limit) found.push({ pair: s.pair, start, remake: rnd() < 0.04 });
    }
  }
  const extra = Math.floor(rnd() * 3);
  for (let i = 0; i < extra; i++) {
    const roleSwap = active.length && rnd() < 0.35;
    const base = roleSwap ? pick(active).pair : pick(pairKeys);
    const { champ } = splitPair(base);
    const pair = roleSwap ? `${pick(Object.keys(ROLES).filter((r) => r !== splitPair(base).role))}|${champ}` : base;
    found.push({ pair, start: from + rnd() * (to - from), remake: false });
  }
  found.sort((a, b) => a.start - b.start);
  for (const f of found) {
    const g = { id: uid('G'), pair: f.pair, start: f.start, remake: f.remake, checkedAt: to, note: '', signup: null };
    if (f.remake) { g.note = 'Remake: does not count. No ticket taken, your sign-up keeps waiting.'; S.games.push(g); continue; }
    // the oldest waiting sign-up with exactly this pair, made before the game started
    const s = S.signups.filter((x) => (x.status === 'waiting' || x.status === 'leaving') && x.pair === f.pair && x.at < f.start && (x.status !== 'leaving' || f.start < x.leaveAt)).sort((a, b) => a.at - b.at)[0];
    if (!s) {
      const sameChamp = S.signups.some((x) => (x.status === 'waiting' || x.status === 'leaving') && splitPair(x.pair).champ === splitPair(f.pair).champ);
      g.note = sameChamp ? 'Same champion, different role: the pair must match exactly. Your sign-up keeps waiting.' : 'No sign-up with this champion and role: not part of any contest.';
      const r = playGame(f.pair, randomPicks(f.pair).slice(0, 0));
      g.win = r.win; g.minutes = r.minutes;
      S.games.push(g); continue;
    }
    const r = playGame(s.pair, s.picks, S.account.skill);
    Object.assign(g, { win: r.win, minutes: r.minutes, results: r.results, total: r.total, signup: s.id });
    s.status = 'played';
    s.gameId = g.id;
    if (s.kind === 'training') {
      g.note = 'Training game: judged and added to your training record.';
      for (const x of r.results) {
        const k = `${s.pair}#${x.id}#${x.level}`;
        const t = S.trainingStats[k] || (S.trainingStats[k] = { pair: s.pair, id: x.id, level: x.level, games: 0, hits: 0 });
        t.games++; if (x.full) t.hits++;
      }
    } else {
      S.balance -= s.ticket;
      let c = Object.values(S.contests).filter((x) => x.state === 'open' && x.ticket === s.ticket && !x.entries.some((e) => e.you)).sort((a, b) => b.entries.length - a.entries.length)[0];
      const opened = !c;
      if (!c) c = newContest(s.ticket, f.start);
      s.contestId = c.id;
      g.note = `${opened ? 'Opened a new contest' : 'Entered a contest'}${s.ticket ? `, ticket ${euro(s.ticket)} taken` : ''}.`;
      addEntry(c, { name: S.account.riotId, tier: S.account.tier, pair: s.pair, at: f.start, ...r, you: true });
      // the balance can never fall short: sign-ups it no longer covers are switched off
      for (const o of S.signups) if (o.status === 'waiting' && o.kind === 'contest' && o.ticket > S.balance) { o.status = 'disabled'; o.note = 'Switched off: your balance no longer covers this ticket.'; }
    }
    S.games.push(g);
  }
  // pending sign-outs: no game started before the request, so the sign-out is accepted
  for (const s of S.signups) if (s.status === 'leaving') { s.status = 'left'; s.note = 'Signed out: no game started before your request.'; }
  if (daily) {
    for (const s of S.signups) if (s.status === 'waiting') { s.status = 'removed'; s.note = 'Removed by the daily check: not played. Nothing was charged.'; }
    S.lastDaily = to;
  }
  botsArrive(elapsed / HOUR);
  S.lastCheck = to;
  save();
  return found.length;
}

// ---------- UI ----------
let toastTimer;
function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 4200);
}
const TABS = [['#/', 'Home'], ['#/train', 'Training'], ['#/contests', 'Contests'], ['#/history', 'Match history'], ['#/rules', 'Rules'], ['#/data', 'Your data']];
function chrome() {
  const h = location.hash || '#/';
  $('#nav').innerHTML = TABS.map(([href, name]) => `<a href="${href}" class="${h === href || (href !== '#/' && h.startsWith(href)) ? 'on' : ''}">${name}</a>`).join('');
  $('#wallet').innerHTML = S.account ? `${esc(S.account.riotId)} · ${tierName(S.account.tier)} · Balance <b>${euro(S.balance)}</b>` : '<a href="#/connect">Connect account</a>';
  $('#games-n').textContent = D.facts.games.toLocaleString('en-GB');
}
function needAccount() {
  if (S.account) return false;
  location.hash = '#/connect';
  return true;
}
const statusTag = (s) => ({ waiting: '<span class="tag wait">waiting for your game</span>', leaving: '<span class="tag wait">sign-out pending until the next check</span>', played: '<span class="tag ok">played</span>', disabled: '<span class="tag no">switched off</span>', removed: '<span class="tag no">removed</span>', left: '<span class="tag">signed out</span>' }[s.status]);
function picksHtml(pair, picks) {
  return picks.map((p) => `<span class="tag ${p.level}">${CH[p.id].name} · ${p.level}</span>`).join(' ');
}
function signupCard(s) {
  const actions = s.status === 'waiting' ? `<button class="btn ghost small" data-leave="${s.id}">Sign out</button>` : '';
  const where = s.contestId ? ` · <a href="#/contest/${s.contestId}">see contest</a>` : '';
  return `<div class="card"><div class="row">${icon(splitPair(s.pair).champ)}<div><b>${pairLabel(s.pair)}</b><div class="small muted">${s.kind === 'training' ? 'Training' : `${s.ticket ? euro(s.ticket) : 'Free'} contest`} · locked ${when(s.at)}</div></div></div>
    <p style="margin-top:10px">${picksHtml(s.pair, s.picks)}</p><div class="row between">${statusTag(s)}${actions}</div>${s.note ? `<p class="small muted" style="margin-top:8px">${esc(s.note)}${where}</p>` : where ? `<p class="small">${where.slice(3)}</p>` : ''}</div>`;
}
function checkBar() {
  return `<div class="card hi"><div class="row between"><div><h3>Checks</h3><p class="small muted">Last check ${S.lastCheck ? when(S.lastCheck) : 'never'} · daily check removes sign-ups not played yet. Simulated time: ${when(S.now)}</p></div>
  <div class="row"><button class="btn" data-check="manual">Run a check</button><button class="btn ghost" data-check="daily">Skip to the daily check</button></div></div></div>`;
}

function viewHome() {
  if (!S.account) {
    app.innerHTML = `<h1>Break your ceiling.</h1><p class="sub">This demo runs the whole Skybreak system in your browser: connect an account, lock a champion, a role and 3 challenges, play, and see how every point is computed. Games and other players are simulated; the thresholds are the real ones.</p>
    <div class="grid"><div class="card hi"><h3>1. Connect your account</h3><p class="muted">Skybreak reads your ranked games through Riot's official API, after you sign in with Riot.</p><a class="btn" href="#/connect">Connect (simulated)</a></div>
    <div class="card"><h3>2. Train for free</h3><p class="muted">Pick 3 challenges and see how far above your tier you play.</p></div>
    <div class="card"><h3>3. Join contests</h3><p class="muted">20 players, your own schedule, measured against your own tier.</p></div></div>`;
    return;
  }
  const waiting = S.signups.filter((s) => ['waiting', 'leaving'].includes(s.status));
  const mine = Object.values(S.contests).filter((c) => c.entries.some((e) => e.you)).sort((a, b) => b.createdAt - a.createdAt);
  app.innerHTML = `<h1>Welcome, ${esc(S.account.riotId.split('#')[0])}</h1><p class="sub">${tierName(S.account.tier)} · EUW. Lock a pair and 3 challenges, then just play: the check finds your game.</p>
  ${checkBar()}
  <h2>Waiting for your game (${waiting.length})</h2>${waiting.length ? `<div class="grid">${waiting.map(signupCard).join('')}</div>` : '<p class="muted">Nothing locked. <a href="#/contests">Join a contest</a> or <a href="#/train">train</a>.</p>'}
  <h2>Your contests</h2>${mine.length ? `<div class="grid">${mine.map(contestCard).join('')}</div>` : '<p class="muted">No contest yet.</p>'}`;
}
function viewConnect() {
  app.innerHTML = `<h1>Connect your account</h1><p class="sub">In the real product this is Riot Sign On: you sign in on Riot's page and Skybreak gets only your Riot ID, your region and your ranked games. Here you just type them.</p>
  <div class="card" style="max-width:520px"><label class="fld" for="rid">Riot ID</label><input type="text" id="rid" placeholder="Name#TAG" value="${S.account ? esc(S.account.riotId) : ''}" style="width:100%">
  <div class="row" style="margin-top:12px"><div><label class="fld" for="tier">Rank tier (read from Riot)</label><select id="tier">${TIERS.map((t) => `<option value="${t}" ${t === 'GOLD' ? 'selected' : ''}>${tierName(t)}</option>`).join('')}</select></div>
  <div><label class="fld">Region</label><select disabled><option>EUW</option></select></div></div>
  <p class="small muted" style="margin-top:12px">We never ask for your Riot password. Demo balance: ${euro(1500)} of play money.</p>
  <button class="btn" id="go">Connect</button></div>`;
  $('#go').onclick = () => {
    const id = $('#rid').value.trim() || 'Summoner#EUW';
    if (!/^.{3,16}#.{2,5}$/.test(id)) { toast('Use the Name#TAG format.'); return; }
    S.account = { riotId: id, tier: $('#tier').value, region: 'EUW', skill: 0.04 };
    S.lastCheck = S.now;
    seedContests(); save(); location.hash = '#/';
  };
}

// --- picking a pair and 3 challenges (shared by training and contests) ---
let draft = null;
function viewPick(kind, ticket) {
  if (needAccount()) return;
  if (!draft || draft.kind !== kind || draft.ticket !== ticket) draft = { kind, ticket, pair: null, picks: [], q: '' };
  const offers = draft.pair ? offersOf(draft.pair) : {};
  const list = pairKeys.filter((k) => !draft.q || pairLabel(k).toLowerCase().includes(draft.q.toLowerCase()));
  const pts = draft.picks.reduce((a, p) => a + POINTS[p.level], 0);
  const together = [];
  for (let i = 0; i < draft.picks.length; i++) for (let j = i + 1; j < draft.picks.length; j++) {
    const k1 = `${draft.picks[i].id} + ${draft.picks[j].id}`, k2 = `${draft.picks[j].id} + ${draft.picks[i].id}`;
    const r = D.together[k1] ?? D.together[k2];
    if (r) together.push(`${CH[draft.picks[i].id].name} and ${CH[draft.picks[j].id].name}`);
  }
  const t = CONTEST_TYPES.find((x) => x.ticket === ticket);
  app.innerHTML = `<h1>${kind === 'training' ? 'Training' : esc(t.name)}</h1>
  <p class="sub">${kind === 'training' ? 'Free. Your game is judged like a contest game and goes into your training record.' : `Lock a champion, a role and 3 challenges. Nothing is charged now: the ticket is taken only when the check finds your next game with this pair.`}</p>
  <h2>1. Champion and role</h2>
  <div class="row" style="margin-bottom:10px"><input type="text" id="q" placeholder="Search: Ahri, Jungle, Support…" value="${esc(draft.q)}"><span class="small muted">${pairKeys.length} pairs played enough on the last two patches</span></div>
  <div class="pairs">${list.map((k) => `<button class="pairbtn ${draft.pair === k ? 'on' : ''}" data-pair="${k}">${icon(splitPair(k).champ)}<span>${champName(splitPair(k).champ)}<br><span class="small muted">${ROLES[splitPair(k).role]}</span></span></button>`).join('')}</div>
  ${draft.pair ? `<h2>2. Three challenges, any levels</h2><p class="muted small">Thresholds for ${pairLabel(draft.pair)}, the same for every player; in the live system they are adjusted to your tier (${tierName(S.account.tier)}). Points: easy ${POINTS.easy}, medium ${POINTS.medium}, hard ${POINTS.hard}. Below the line of the chosen level you still get part of the points, from the line below it.</p>
  <div class="grid">${D.challenges.filter((c) => offers[c.id]).map((c) => {
    const chosen = draft.picks.find((p) => p.id === c.id);
    return `<div class="ch ${chosen ? 'on' : ''}"><div class="row between"><h3>${c.name}</h3><span class="tag">${c.family}</span></div>
      <p class="small muted">${challengeText(draft.pair, c.id, chosen ? chosen.level : LEVELS.find((l) => offers[c.id][LEVELS.indexOf(l)] != null))}</p>
      <div class="levels">${LEVELS.map((l, i) => `<button class="lv ${chosen && chosen.level === l ? 'on' : ''}" data-ch="${c.id}" data-lv="${l}" ${offers[c.id][i] == null ? 'disabled title="Not offered: not fair enough for this pair at this level"' : ''}><b>${l} · ${POINTS[l]}</b>${offers[c.id][i] == null ? 'not offered' : fmt(c.id, Array.isArray(offers[c.id][i]) ? offers[c.id][i][0] : offers[c.id][i])}</button>`).join('')}</div></div>`;
  }).join('')}</div>
  <div class="card hi" style="margin-top:16px"><div class="row between"><div><b>${draft.picks.length}/3 challenges</b> · up to ${pts} points<div style="margin-top:6px">${picksHtml(draft.pair, draft.picks)}</div>
  ${together.length ? `<p class="small" style="margin-top:8px;color:var(--warn)">${together.join('; ')} tend to succeed together: more risk, more reward. Allowed.</p>` : ''}</div>
  <button class="btn" id="lock" ${draft.picks.length === 3 ? '' : 'disabled'}>Lock ${kind === 'training' ? 'and train' : 'and sign up'}</button></div>
  ${kind === 'contest' && ticket > S.balance ? `<p class="small" style="color:var(--bad)">Your balance (${euro(S.balance)}) does not cover this ticket.</p>` : ''}</div>` : ''}`;
  const q = $('#q');
  q.oninput = () => { draft.q = q.value; const pos = q.selectionStart; viewPick(kind, ticket); const nq = $('#q'); nq.focus(); nq.setSelectionRange(pos, pos); };
  app.querySelectorAll('[data-pair]').forEach((b) => (b.onclick = () => { draft.pair = b.dataset.pair; draft.picks = []; viewPick(kind, ticket); }));
  app.querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => {
    const { ch, lv } = b.dataset;
    const at = draft.picks.findIndex((p) => p.id === ch);
    if (at >= 0 && draft.picks[at].level === lv) draft.picks.splice(at, 1);
    else if (at >= 0) draft.picks[at].level = lv;
    else if (draft.picks.length < 3) draft.picks.push({ id: ch, level: lv });
    else { toast('Three challenges: remove one first.'); return; }
    const y = scrollY; viewPick(kind, ticket); scrollTo(0, y);
  }));
  const lock = $('#lock');
  if (lock) lock.onclick = () => {
    if (kind === 'contest' && ticket > S.balance) { toast('You need at least one ticket in your balance to sign up.'); return; }
    S.signups.push({ id: uid('S'), kind, ticket: kind === 'training' ? 0 : ticket, pair: draft.pair, picks: draft.picks.map((p) => ({ ...p })), at: S.now, status: 'waiting' });
    draft = null; save(); toast('Locked. Now play your game: the next check will find it.'); location.hash = '#/';
  };
}
function viewTrain() {
  if (needAccount()) return;
  const stats = Object.values(S.trainingStats);
  const games = S.games.filter((g) => g.signup && S.signups.find((s) => s.id === g.signup)?.kind === 'training');
  app.innerHTML = `<h1>Training</h1><p class="sub">Free, as many as you like. Each challenge says how often the average ${tierName(S.account.tier)} player with your champion and role makes it: easy 6 in 10 games, medium 1 in 3, hard 1 in 7. If you make it more often, you play above your tier.</p>
  <div class="row"><a class="btn" href="#/train/new">Lock a training game</a></div>
  <h2>Your edge over your tier</h2>${stats.length ? `<div class="tablewrap"><table><tr><th>Pair</th><th>Challenge</th><th>Level</th><th>Games</th><th>You made it</th><th>Average player</th><th>Your edge</th></tr>
  ${stats.map((t) => { const exp = D.levels[t.level].target; const you = t.hits / t.games; const edge = you / exp; return `<tr><td>${pairLabel(t.pair)}</td><td>${CH[t.id].name}</td><td><span class="tag ${t.level}">${t.level}</span></td><td>${t.games}</td><td>${Math.round(you * 100)}%</td><td>${Math.round(exp * 100)}%</td><td style="color:${edge >= 1 ? 'var(--good)' : 'var(--bad)'}">×${edge.toFixed(2)}</td></tr>`; }).join('')}</table></div><p class="small muted">With few games luck still counts: the edge becomes reliable after about 20 games per challenge.</p>` : '<p class="muted">No training game yet.</p>'}
  <h2>Training games</h2>${games.length ? games.slice().reverse().map(gameCard).join('') : '<p class="muted">None yet.</p>'}`;
}

// --- contests ---
function contestCard(c) {
  const me = c.entries.find((e) => e.you);
  return `<div class="card"><div class="row between"><h3>${c.ticket ? euro(c.ticket) : 'Free'} contest</h3><span class="tag ${c.state === 'open' ? 'wait' : 'ok'}">${c.state === 'open' ? 'open' : 'finished'}</span></div>
  <div class="bar" style="margin:8px 0"><i style="width:${(c.entries.length / SEATS) * 100}%"></i></div>
  <p class="small muted">${c.entries.length} of ${SEATS} games${me ? ` · you: ${me.total} pts${me.place ? `, ${me.place}°${me.prize ? `, won ${euro(me.prize)}` : ''}` : ''}` : ''}</p><a href="#/contest/${c.id}">Leaderboard</a></div>`;
}
function viewContests() {
  if (needAccount()) return;
  const open = Object.values(S.contests).filter((c) => c.state === 'open');
  const done = Object.values(S.contests).filter((c) => c.state === 'done').sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  app.innerHTML = `<h1>Contests</h1><p class="sub">Sign up to one or more. Each sign-up locks a pair and 3 challenges; your next ranked solo game with that pair goes into a contest with free seats, or opens a new one. A contest ends when it has ${SEATS} games.</p>
  <div class="grid">${CONTEST_TYPES.map((t) => `<div class="card hi"><h3>${t.name}</h3><p class="muted small">${t.blurb}</p>${t.ticket ? `<p class="small">1st ${euro(t.ticket * 2)} · 2nd ${euro(t.ticket * 1.7)} · 3rd ${euro(t.ticket * 1.5)} · 4th ${euro(t.ticket * 1.2)} · 5th-12th ticket back · 13th-14th ${euro(t.ticket * 0.8)}</p>` : ''}<a class="btn" href="#/join/${t.ticket}">Sign up</a></div>`).join('')}</div>
  <h2>Open now</h2><div class="grid">${open.map(contestCard).join('')}</div>
  ${done.length ? `<h2>Recently finished</h2><div class="grid">${done.map(contestCard).join('')}</div>` : ''}`;
}
function viewContest(id) {
  const c = S.contests[id];
  if (!c) { app.innerHTML = '<p>Contest not found.</p>'; return; }
  const rows = [...c.entries].sort((a, b) => (c.state === 'done' ? a.place - b.place : b.total - a.total));
  app.innerHTML = `<p><a href="#/contests">← Contests</a></p><h1>${c.ticket ? euro(c.ticket) : 'Free'} contest</h1>
  <p class="sub">${c.state === 'open' ? `Open: ${c.entries.length} of ${SEATS} games. Provisional leaderboard.` : `Finished: final leaderboard${c.ticket ? `, prizes ${euro(c.pool)} (80% of tickets)` : ''}.`} Everyone is measured against the average player of their own tier, champion and role.</p>
  <div class="tablewrap"><table><tr><th>#</th><th>Player</th><th>Tier</th><th>Pair</th><th>Challenges</th><th>Points</th>${c.state === 'done' && c.ticket ? '<th>Prize</th>' : ''}</tr>
  ${rows.map((e, i) => `<tr class="${e.you ? 'you' : ''}"><td>${c.state === 'done' ? e.place : i + 1}</td><td>${esc(e.name)}${e.you ? ' (you)' : ''}</td><td>${tierName(e.tier)}</td><td><div class="row">${icon(splitPair(e.pair).champ)}<span class="small">${pairLabel(e.pair)}</span></div></td>
  <td class="small">${e.results.map((r) => `${CH[r.id].name} <span class="tag ${r.level}">${r.level}</span> ${fmt(r.id, r.value)} → <b>${r.points}</b>`).join('<br>')}</td><td><b>${e.total}</b></td>${c.state === 'done' && c.ticket ? `<td>${e.prize ? euro(e.prize) : '—'}</td>` : ''}</tr>`).join('')}</table></div>
  ${c.ticket ? '<p class="small muted">Lines: places 1-4 earn more than the ticket, 5-12 get the ticket back, 13-14 get 80%. Ties share the prizes of the places they hold.</p>' : ''}`;
}

// --- match history ---
function gameCard(g) {
  const s = g.signup ? S.signups.find((x) => x.id === g.signup) : null;
  return `<div class="card" style="margin-bottom:10px"><div class="row between"><div class="row">${icon(splitPair(g.pair).champ)}<div><b>${pairLabel(g.pair)}</b><div class="small muted">Ranked solo · started ${when(g.start)}${g.minutes ? ` · ${g.minutes} min · ${g.win ? 'win' : 'loss'}` : ''}</div></div></div>${g.total != null ? `<span class="kpi">${g.total}</span>` : ''}</div>
  <p class="small" style="margin-top:8px">${esc(g.note)}${s && s.contestId ? ` <a href="#/contest/${s.contestId}">Leaderboard</a>` : ''}</p>
  ${g.results ? `<div class="tablewrap"><table><tr><th>Challenge</th><th>Your value</th><th>Line below</th><th>Level line</th><th>Points</th></tr>${g.results.map((r) => `<tr><td>${CH[r.id].name} <span class="tag ${r.level}">${r.level}</span></td><td>${fmt(r.id, r.value)}</td><td>${fmt(r.id, r.lo)}</td><td>${fmt(r.id, r.hi)}</td><td>${r.full ? `<b>${r.points}</b> (made it)` : r.frac > 0 ? `<b>${r.points}</b> (${Math.round(r.frac * 100)}% of the way)` : '0'}</td></tr>`).join('')}</table></div>` : ''}</div>`;
}
function viewHistory() {
  if (needAccount()) return;
  const list = S.games.slice().sort((a, b) => b.start - a.start);
  app.innerHTML = `<h1>Match history</h1><p class="sub">Every game the checks found, and what happened to it. Nothing is hidden: if a game did not count, it says why.</p>${checkBar()}<h2>Games (${list.length})</h2>${list.length ? list.map(gameCard).join('') : '<p class="muted">No games yet: lock a pair, then run a check.</p>'}
  <h2>Sign-ups</h2>${S.signups.length ? `<div class="grid">${S.signups.slice().reverse().map(signupCard).join('')}</div>` : '<p class="muted">None.</p>'}`;
}

// --- rules ---
function viewRules() {
  app.innerHTML = `<div class="rules"><h1>Rules</h1><p class="sub">The complete rules. They are the same for everyone, published before you sign up, and they change only with notice.</p>
  <div class="card"><b>On this page:</b> <a href="#/rules" data-go="r-fair">Fairness</a> · <a href="#/rules" data-go="r-ch">Challenges</a> · <a href="#/rules" data-go="r-pts">Points</a> · <a href="#/rules" data-go="r-contest">Contests</a> · <a href="#/rules" data-go="r-check">Checks</a> · <a href="#/rules" data-go="r-games">Valid games</a> · <a href="#/rules" data-go="r-prize">Prizes</a></div>
  <h2 id="r-fair">What fair means</h2>
  <p>A challenge is fair if it happens as often as declared to anyone who plays that champion, in that role, at that rank tier, whether the game is won or lost. It is a real challenge if better players make it happen more often. Thresholds are the same for everyone, computed from recent public ranked games of everyone, never from your own games.</p>
  <ul><li>Easy: the average player makes it in about 6 games out of 10 (60%). Medium: about 1 in 3 (35%). Hard: about 1 in 7 (15%).</li>
  <li>On ${D.facts.games.toLocaleString('en-GB')} ranked games (EUW), with thresholds fixed on older games and tested on newer ones, challenges happened 60.1%, 35.1% and 15.0% of the time.</li>
  <li>Success follows the player, not luck: a player's results on odd and even games correlate ${D.facts.follow.toFixed(2)}; winning alone correlates ${D.facts.wins.toFixed(2)}.</li>
  <li>Picking the challenge that happened most for a champion gives no lasting edge (×${D.facts.edgeChallenge.toFixed(2)}), nor does picking the luckiest champion (×${D.facts.edgeChampion.toFixed(2)}).</li>
  <li>A challenge is offered to a pair only if it passes six steps: the pair is really played (0.2% of its role's games on the last two patches), enough games (at least 150), written for that pair, the threshold hits the declared frequency, it does not depend on winning, game length or tier, and it depends on the player.</li></ul>
  <h2 id="r-ch">The 14 challenges</h2><div class="tablewrap"><table><tr><th>Challenge</th><th>What it measures</th></tr>${D.challenges.map((c) => `<tr><td><b>${c.name}</b><br><span class="small muted">${c.family}</span></td><td class="small">${c.text.replace(/\{x\}|\{xl\}/g, '<i>threshold</i>').replace(/\{y\d0\}/g, '…')}${c.notRoles.length ? ' Not offered to supports.' : ''}</td></tr>`).join('')}</table></div>
  <p>Gapping, Visionary and Duelist need a clear gap over your direct lane opponent: a tie never wins and a small edge is not enough. Immortal and Gapping compare won games with won games and lost games with lost games, so they have two thresholds. Challenges that tend to succeed together can be taken together: on average they give no more points, only more risk.</p>
  <h2 id="r-pts">Points</h2><ul><li>Pick 3 different challenges, any mix of levels. Easy ${POINTS.easy} points, medium ${POINTS.medium}, hard ${POINTS.hard}.</li><li>Window scoring: reach the line of the chosen level and you get all its points. Between the line below it and that line, points grow in proportion. Below the line below, nothing. You never get more than the chosen level.</li><li>Your contest score is the sum of your 3 challenges.</li></ul>
  <h2 id="r-contest">Contests</h2><ul>
  <li>A contest has ${SEATS} seats and lasts until it has ${SEATS} games.</li>
  <li>You sign up to one or more contests. For each one you lock a champion, a role and 3 challenges; the time of the sign-up is saved. Nothing can be changed after locking.</li>
  <li>Your next ranked solo game with exactly that champion and that role, started after the sign-up, is your game for that contest. The champion and the role are the ones Riot records in the game. If only one of the two matches, the game does not count and the sign-up keeps waiting.</li>
  <li>When the check finds the game, the ticket is taken, the game is scored and it enters an open contest with free seats where you are not already, or opens a new one where you are first.</li>
  <li>Several sign-ups with the same pair queue up: the game that started first goes to the sign-up made first. Each game counts for one contest only. You are never twice in the same contest.</li>
  <li>The balance can never fall short. You need one ticket in your balance to sign up; each game found takes its ticket, and sign-ups the remaining balance no longer covers are switched off at no cost.</li>
  <li>Signing out is allowed until the game is played. The request waits for the next check: if a valid game started before the request, it enters the contest; otherwise you are out and pay nothing.</li>
  <li>Nothing appears on your screen during the game: no overlay, no pop-up.</li>
  <li>If a contest does not reach ${SEATS} games, it is cancelled and every ticket is returned.</li></ul>
  <h2 id="r-check">Checks</h2><ul><li>Every day the system checks the games of everyone with a sign-up. Sign-ups not played by the daily check are removed at no cost: a sign-up lasts at most until the next daily check.</li><li>You can run a check whenever you want: you see your match history and, for each game, which contest it went to or why it did not count. This check does not remove anything.</li></ul>
  <h2 id="r-games">Which games count</h2><div class="tablewrap"><table><tr><th>Case</th><th>Rule</th></tr>
  <tr><td>Remake</td><td>Does not count. No ticket taken, the sign-up keeps waiting.</td></tr><tr><td>Dodge</td><td>Not a game: nothing happens.</td></tr>
  <tr><td>Surrender</td><td>Counts normally: a win for the winners, a loss for the side that surrendered. Challenges are judged on what happened; in the checkpoint challenges only the moments reached count.</td></tr>
  <tr><td>Under 10 minutes</td><td>Does not count, like a remake.</td></tr><tr><td>Normal, flex, ARAM</td><td>Do not count.</td></tr></table></div>
  <h2 id="r-prize">Prizes (20 seats)</h2><p>80% of the tickets go back to the players as prizes, shown as multiples of the ticket:</p>
  <div class="tablewrap"><table><tr><th>Place</th><th>Prize</th><th>With a 5 € ticket</th></tr><tr><td>1st</td><td>×2</td><td>10 €</td></tr><tr><td>2nd</td><td>×1.7</td><td>8.50 €</td></tr><tr><td>3rd</td><td>×1.5</td><td>7.50 €</td></tr><tr><td>4th</td><td>×1.2</td><td>6 €</td></tr><tr><td>5th-12th</td><td>×1, ticket back</td><td>5 €</td></tr><tr><td>13th-14th</td><td>×0.8</td><td>4 €</td></tr><tr><td>15th-20th</td><td>—</td><td>0 €</td></tr></table></div>
  <p>Ties happen when players end on the same points, for example two players who fully complete the same mix of levels. The tied players add up the prizes of the places they hold and split them equally.</p></div>`;
  app.querySelectorAll('[data-go]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); document.getElementById(a.dataset.go).scrollIntoView({ behavior: 'smooth' }); }));
}

// --- data transparency ---
function viewData() {
  const pair = (S._dataPair && D.pairs[S._dataPair]) ? S._dataPair : 'MIDDLE|Ahri';
  app.innerHTML = `<h1>Your data</h1><p class="sub">Your games are yours. Here is everything Skybreak reads, keeps and computes, and every threshold in use.</p>
  <div class="grid"><div class="card"><h3>What we read from Riot</h3><p class="small muted">Only through Riot's official API, after you sign in with Riot: your Riot ID and region, your rank tier, and your ranked solo games (champion, role, start time, length, result, and the game statistics the challenges need, such as gold, kills, wards and damage). Nothing during the game.</p></div>
  <div class="card"><h3>What we keep</h3><p class="small muted">Your sign-ups (pair, challenges, time), the games that the checks found, how each one was scored, your contests and your balance. Thresholds are computed on everyone's public ranked games, never on yours alone.</p></div>
  <div class="card"><h3>What we never do</h3><p class="small muted">No MMR or rating of players, no data sold, no information about other players beyond their contest results, nothing shown during your game.</p></div></div>
  <h2>Every threshold, for every pair</h2><div class="row" style="margin-bottom:10px"><select id="dp">${pairKeys.map((k) => `<option value="${k}" ${k === pair ? 'selected' : ''}>${pairLabel(k)}</option>`).join('')}</select><span class="small muted">The real thresholds of the current catalog (${D.generated}), before the small adjustment to your tier.</span></div>
  <div class="tablewrap"><table><tr><th>Challenge</th><th>Easy</th><th>Medium</th><th>Hard</th></tr>${D.challenges.map((c) => { const o = offersOf(pair)[c.id]; return `<tr><td>${c.name}</td>${LEVELS.map((l, i) => { const v = o ? o[i] : null; return `<td>${v == null ? '<span class="muted">not offered</span>' : Array.isArray(v) ? `${fmt(c.id, v[0])} win · ${fmt(c.id, v[1])} loss` : fmt(c.id, v)}</td>`; }).join('')}</tr>`; }).join('')}</table></div>
  <h2>Everything this demo stored about you</h2><p class="small muted">In this demo it lives only in your browser. In the real product you can download it the same way and ask us to delete it.</p>
  <div class="row"><button class="btn ghost" id="dl">Download my data (JSON)</button><button class="btn ghost" id="reset">Reset the demo</button></div>`;
  $('#dp').onchange = (e) => { S._dataPair = e.target.value; viewData(); };
  $('#dl').onclick = () => {
    const blob = new Blob([JSON.stringify({ account: S.account, balanceCents: S.balance, signups: S.signups, games: S.games, contests: Object.values(S.contests).filter((c) => c.entries.some((e) => e.you)) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'skybreak-my-data.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#reset').onclick = () => { if (confirm('Reset the demo? Your simulated account, games and contests are deleted.')) { S = fresh(); save(); location.hash = '#/'; render(); } };
}

// ---------- router ----------
function render() {
  chrome();
  const h = location.hash || '#/';
  const m = h.match(/^#\/(\w+)(?:\/(.+))?/);
  const [route, arg] = m ? [m[1], m[2]] : ['', ''];
  if (route === 'connect') viewConnect();
  else if (route === 'train') arg === 'new' ? viewPick('training', 0) : viewTrain();
  else if (route === 'contests') viewContests();
  else if (route === 'join') viewPick('contest', Number(arg) || 0);
  else if (route === 'contest') viewContest(arg);
  else if (route === 'history') viewHistory();
  else if (route === 'rules') viewRules();
  else if (route === 'data') viewData();
  else viewHome();
  chrome();
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-check]');
  if (c) {
    if (!S.account) return;
    const n = runCheck({ daily: c.dataset.check === 'daily' });
    toast(n ? `Check done: ${n} new game${n > 1 ? 's' : ''} found.` : 'Check done: no new games.');
    render();
  }
  const l = e.target.closest('[data-leave]');
  if (l) {
    const s = S.signups.find((x) => x.id === l.dataset.leave);
    if (s && s.status === 'waiting') { s.status = 'leaving'; s.leaveAt = S.now; save(); toast('Sign-out requested: the next check decides.'); render(); }
  }
});
addEventListener('hashchange', () => { render(); scrollTo(0, 0); });
load();
render();
