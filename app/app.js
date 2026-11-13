// Skybreak demo. Three areas: public (sign in, create account), the free area (home, match history,
// training, milestones) and the contest area (wallet, contests, sign-ups, leaderboards).
// The 5 accounts are real EUW players (invented names): their games and challenge values are real, and the
// thresholds are the real v2 catalog with its tier correction. Checks reveal the account's next real game;
// other contest players and the clock are simulated. Everything is kept only in this browser.
'use strict';
const D = window.SKY;
const PROFILES = window.PROFILES;
const ADJ = window.ADJUST;
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const LEVELS = ['easy', 'medium', 'hard'];
const LEVEL_Q = { easy: 0.40, medium: 0.65, hard: 0.85 }; // share of games below each line (60/35/15% reach it)
const POINTS = { easy: D.levels.easy.points, medium: D.levels.medium.points, hard: D.levels.hard.points };
const TARGET = { easy: D.levels.easy.target, medium: D.levels.medium.target, hard: D.levels.hard.target };
const ROLES = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', BOTTOM: 'Bot', UTILITY: 'Support' };
const TIERS = ['GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER'];
const tierName = (t) => t[0] + t.slice(1).toLowerCase();
const CH = Object.fromEntries(D.challenges.map((c) => [c.id, c]));
const PRIZE_X = [2, 1.7, 1.5, 1.2, 1, 1, 1, 1, 1, 1, 1, 1, 0.8, 0.8, 0, 0, 0, 0, 0, 0];
const SEATS = 20;
const TICKETS = [0, 200, 500, 1000];
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const START_BALANCE = 2000;
const PAST_SHARE = 0.7; // the account's older games are its history; the newer ones are revealed by checks

// ---------- state ----------
const KEY = 'skybreak-demo-v2';
let S;
function fresh() {
  return { profile: null, signupForm: null, verified: false, balance: START_BALANCE, points: 0, now: Date.now(), lastCheck: Date.now(), cursor: 0, signups: [], games: [], contests: {}, milestones: [], seq: 1, seeded: false };
}
function load() {
  try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { S = fresh(); }
  if (!S.contests) S = fresh();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: works until reload */ } }
const uid = (p) => `${p}${S.seq++}`;
const P = () => PROFILES[S.profile];

let seed = (Date.now() % 2147483647) || 7;
const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

// ---------- catalog: thresholds with the tier correction ----------
const pairKeys = Object.keys(D.pairs).sort((a, b) => D.champions[a.split('|')[1]].localeCompare(D.champions[b.split('|')[1]]));
const splitPair = (k) => { const [role, champ] = k.split('|'); return { role, champ }; };
const champName = (c) => D.champions[c] || c;
const icon = (c, cls = 'champ') => `<img class="${cls}" alt="" loading="lazy" src="https://ddragon.leagueoflegends.com/cdn/${D.ddragon}/img/champion/${c}.png" onerror="this.style.visibility='hidden'">`;
const pairLabel = (k) => { const { role, champ } = splitPair(k); return `${champName(champ)} ${ROLES[role]}`; };
const offersOf = (pair) => D.pairs[pair] || {};
const tierGroup = (t) => (['PLATINUM', 'EMERALD', 'DIAMOND'].includes(t) ? t : ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(t) ? 'MASTER' : 'GOLD');
/** The line a player of this tier must reach: the catalog's pair threshold, corrected for the tier. */
function lineOf(pair, id, level, win, tier) {
  const v = (offersOf(pair)[id] || [])[LEVELS.indexOf(level)];
  if (v == null) return null;
  const base = Array.isArray(v) ? (win ? v[0] : v[1]) : v;
  const a = ADJ[id]?.[level]?.[`${splitPair(pair).role}:${tierGroup(tier)}`];
  return a ? base * a[0] + a[1] : base;
}
const isCount = (id) => CH[id].format === 'count';
function anchors(pair, id, win, tier) {
  const known = LEVELS.map((l) => [LEVEL_Q[l], lineOf(pair, id, l, win, tier)]).filter(([, v]) => v != null);
  let slope;
  if (known.length >= 2) slope = (known[known.length - 1][1] - known[0][1]) / (known[known.length - 1][0] - known[0][0]);
  else slope = isCount(id) ? 4 : Math.max(Math.abs(known[0][1]) * 1.2, 0.05);
  return { known, slope };
}
/** Value at quantile u of the pair's distribution, through the known lines: used for simulated players only. */
function valueAt(pair, id, win, u, tier) {
  const { known, slope } = anchors(pair, id, win, tier);
  let v;
  if (u <= known[0][0]) v = known[0][1] - (known[0][0] - u) * slope;
  else if (u >= known[known.length - 1][0]) v = known[known.length - 1][1] + (u - known[known.length - 1][0]) * slope;
  else for (let i = 0; i < known.length - 1; i++) {
    const [q0, v0] = known[i], [q1, v1] = known[i + 1];
    if (u >= q0 && u <= q1) v = v0 + ((u - q0) / (q1 - q0)) * (v1 - v0);
  }
  if (isCount(id)) v = Math.round(v);
  if (CH[id].format === 'amount') v = Math.max(300, v);
  if (CH[id].format === 'percent') v = Math.max(0, Math.min(1, v));
  if (CH[id].format === 'share-max') v = Math.max(-1, Math.min(0, v));
  return v;
}
function lowLine(pair, id, level, win, tier) {
  const hi = lineOf(pair, id, level, win, tier);
  const i = LEVELS.indexOf(level);
  const below = i > 0 ? lineOf(pair, id, LEVELS[i - 1], win, tier) : null;
  if (below != null && below < hi) return below;
  const q = i > 0 ? LEVEL_Q[LEVELS[i - 1]] : 0.15;
  const v = valueAt(pair, id, win, q, tier);
  return v < hi ? v : hi - (isCount(id) ? 1 : Math.abs(hi) * 0.2 || 0.05);
}
/** Window scoring: full points at the line of the chosen level, a share of them from the line below. */
function score(pair, p, value, win, tier) {
  const hi = lineOf(pair, p.id, p.level, win, tier);
  const lo = lowLine(pair, p.id, p.level, win, tier);
  const full = value >= hi;
  const frac = full ? 1 : Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return { hi, lo, full, frac, points: Math.round(frac * POINTS[p.level] * 10) / 10 };
}
function fmt(id, v) {
  if (v == null) return '—';
  const f = CH[id].format;
  if (id === 'multikill') return ['—', 'single', 'double', 'triple', 'quadra', 'penta'][Math.max(0, Math.min(5, Math.round(v)))] || String(v);
  if (f === 'percent') return `${Math.round(v * 100)}%`;
  if (f === 'share-max') return `${Math.round(Math.abs(v) * 100)}%`;
  if (f === 'advantage') return `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  if (f === 'count') return `${v >= 0 ? '+' : ''}${Math.round(v)}`;
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
function challengeText(pair, id, level, tier) {
  const x = lineOf(pair, id, level, true, tier), xl = lineOf(pair, id, level, false, tier);
  return CH[id].text.replace('{x}', `<b>${fmt(id, x)}</b>`).replace('{xl}', `<b>${fmt(id, xl)}</b>`)
    .replace('{y10}', yValue(pair, id, 'y10', x) ?? '—').replace('{y20}', yValue(pair, id, 'y20', x) ?? '—').replace('{y30}', yValue(pair, id, 'y30', x) ?? '—');
}
const euro = (c) => `${(c / 100).toFixed(c % 100 ? 2 : 0).replace('.', ',')} €`;
const when = (t) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const day = (t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const pct = (x) => `${Math.round(x * 100)}%`;

// ---------- the account's own record: how often it beats its tier ----------
/** The level a challenge is measured at in the profile: medium where offered, otherwise the one there is. */
function refLevel(pair, id) {
  const o = offersOf(pair)[id];
  if (!o) return null;
  return o[1] != null ? 'medium' : o[0] != null ? 'easy' : 'hard';
}
/** Per pair, challenge and level: games judged and games made, on the account's tier lines. */
function record(games, tier) {
  const r = {};
  for (const g of games) {
    for (const id of Object.keys(offersOf(g.pair))) {
      const v = g.v[id];
      if (v == null) continue;
      for (const level of LEVELS) {
        const line = lineOf(g.pair, id, level, g.win, tier);
        if (line == null) continue;
        const k = `${g.pair}#${id}#${level}`;
        const t = r[k] || (r[k] = { pair: g.pair, id, level, n: 0, hits: 0 });
        t.n++; if (v >= line) t.hits++;
      }
    }
  }
  return r;
}
const myGames = () => S.games;
let recCache = null;
function rec() {
  const k = `${S.profile}:${S.games.length}`;
  if (!recCache || recCache.k !== k) recCache = { k, r: record(myGames(), P().tier) };
  return recCache.r;
}
function mains() {
  const n = {};
  for (const g of myGames()) n[g.pair] = (n[g.pair] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([pair, games]) => ({ pair, games }));
}
/** Edge per challenge on one pair (or all pairs): made minus expected, over games judged, at the reference level. */
function edges(pair) {
  const r = rec();
  const by = {};
  for (const t of Object.values(r)) {
    if (pair && t.pair !== pair) continue;
    if (t.level !== refLevel(t.pair, t.id)) continue;
    const e = by[t.id] || (by[t.id] = { id: t.id, n: 0, hits: 0, expected: 0, level: t.level });
    e.n += t.n; e.hits += t.hits; e.expected += TARGET[t.level] * t.n;
  }
  return Object.values(by).filter((e) => e.n >= 8).map((e) => ({ ...e, you: e.hits / e.n, avg: e.expected / e.n, edge: (e.hits - e.expected) / e.n })).sort((a, b) => b.edge - a.edge);
}

// ---------- tips per challenge, by tier band ----------
const TIPS = {
  'power-farmer': ['Last-hit every minion you can before trading: early farm is the cheapest gold in the game.', 'Track the enemy jungler, so you can stay in lane and keep farming through minute 10.', 'Plan your first back around the wave, so you never lose a full wave of minions.'],
  roamer: ['When your lane is pushed, look at the map: a short walk to the next lane is often a free kill.', 'Shove the wave before you roam: you lose no farm and your opponent has to choose.', 'Roam on timers: right before dragon, or when the enemy jungler shows on the other side.'],
  cacciatore: ['Save part of your damage for the last hit instead of opening with everything.', 'In fights, stand where low-health enemies will try to escape.', 'Track enemy summoner spells: kills are easiest right after Flash is down.'],
  duellante: ['Fight when your spells are up and theirs are not: count their cooldowns.', 'Learn your power spikes (levels 2, 3, 6, first item) and trade hard on them.', 'Use the wave: fight on your side of the lane, next to your minions.'],
  'poche-morti': ['Before you walk forward, ask where the enemy jungler is. If you don\'t know, don\'t go.', 'Ward your way out, not only the river: most deaths come from the side you didn\'t see.', 'Don\'t overstay after a won fight: that is where late deaths come from.'],
  'meat-wall': ['Stand in front of your carries: damage you take is damage they don\'t.', 'Buy armor or magic resist against the enemy\'s main damage, not the same build every game.', 'Engage from the angle that pulls the enemy\'s spells onto you first.'],
  immortale: ['Use your defensive spells before you\'re low, not after.', 'When you\'re the target, build resistances early so each life absorbs more.', 'Absorb pressure, then back out one second before the enemy expects.'],
  'cc-machine': ['Land your crowd control on the enemy your team can kill, not on the closest one.', 'Chain your stun after an ally\'s, not at the same time.', 'Hold your crowd control for the enemy\'s key engage or escape.'],
  'split-pusher': ['After a won fight, hit a tower before you go back to farming.', 'Push a side lane while the enemy is busy at dragon or baron.', 'Push when you know where your counter is, so you leave before they arrive.'],
  illuminato: ['Buy a control ward every back and use your trinket on cooldown.', 'Clear the enemy wards in your river before every objective.', 'Ward where the next fight will be, a minute before the objective spawns.'],
  golden: ['Farm between fights: every wave you skip is gold you never see again.', 'Take the side waves after your team takes an objective.', 'Take what your team can\'t use: far waves and camps nobody is farming.'],
  gapping: ['Win lane by farm first: a 20-minion lead is a gap even without kills.', 'Ask your jungler to play around your lane in the first 10 minutes.', 'When ahead, keep the wave near your tower so your opponent loses gold and experience.'],
  multikill: ['Wait for the enemy\'s big spells before you jump in.', 'Look for fights right after the enemy\'s main engage is used.', 'Flank in team fights: multikills come from the side, not the front.'],
  ovunque: ['Follow your jungler to every fight in your half of the map.', 'Group with your team after your first item: kills happen around objectives.', 'Move to the next fight before it starts, by watching who is missing from the map.'],
};
const band = (t) => (t === 'GOLD' || t === 'PLATINUM' ? 0 : t === 'MASTER' ? 2 : 1);
const tip = (id) => TIPS[id]?.[band(P().tier)] ?? '';

// ---------- simulated other players ----------
const NAMES = ['Nightglass', 'Kaeru', 'Velmora', 'Tidecaller', 'Ashfang', 'Orrin', 'Sablewing', 'Quietstorm', 'Brisa', 'Halcyon', 'Mirelle', 'Jotun', 'Pyrelight', 'Zephra', 'Tamsin', 'Coldiron', 'Wren', 'Saffi', 'Ondine', 'Brokenhalo', 'Grimsby', 'Kestrel', 'Novaline', 'Thistle', 'Umbral', 'Vesper', 'Yarrow', 'Fenwick'];
function randomPicks(pair) {
  const offers = Object.entries(offersOf(pair)).flatMap(([id, lv]) => lv.map((v, i) => (v == null ? null : { id, level: LEVELS[i] })).filter(Boolean));
  const out = [];
  while (out.length < 3 && offers.length) {
    const o = offers.splice(Math.floor(rnd() * offers.length), 1)[0];
    if (!out.some((p) => p.id === o.id)) out.push(o);
  }
  return out;
}
function botEntry(at) {
  const pair = pick(pairKeys), tier = pick(TIERS), picks = randomPicks(pair), win = rnd() < 0.5, skill = (rnd() - 0.5) * 0.1;
  const results = picks.map((p) => { const value = valueAt(pair, p.id, win, Math.max(0.001, Math.min(0.999, rnd() + skill + gauss() * 0.03)), tier); return { ...p, value, ...score(pair, p, value, win, tier) }; });
  return { name: `${pick(NAMES)}#${String(Math.floor(rnd() * 900) + 100)}`, tier, pair, at, win, results, total: Math.round(results.reduce((a, r) => a + r.points, 0) * 10) / 10, you: false };
}
function newContest(ticket, at) {
  const id = uid('C');
  S.contests[id] = { id, ticket, createdAt: at, state: 'open', entries: [] };
  return S.contests[id];
}
function seedContests() {
  if (S.seeded) return;
  for (const t of TICKETS) for (let k = 0; k < 2; k++) {
    const c = newContest(t, S.now - (k + 1) * 5 * HOUR);
    const n = k === 0 ? 8 + Math.floor(rnd() * 8) : SEATS;
    for (let i = 0; i < n; i++) addEntry(c, botEntry(c.createdAt + i * 20 * 60e3), true);
  }
  S.seeded = true;
}
function settle(c, quiet) {
  const ranked = [...c.entries].sort((a, b) => b.total - a.total || a.at - b.at);
  let i = 0;
  while (i < ranked.length) {
    let j = i;
    while (j + 1 < ranked.length && ranked[j + 1].total === ranked[i].total) j++;
    const sum = PRIZE_X.slice(i, j + 1).reduce((a, x) => a + x * c.ticket, 0);
    for (let k = i; k <= j; k++) { ranked[k].place = i + 1; ranked[k].prize = Math.round(sum / (j - i + 1)); }
    i = j + 1;
  }
  Object.assign(c, { entries: ranked, state: 'done', pool: c.ticket * SEATS * 0.8, closedAt: S.now });
  const me = ranked.find((e) => e.you);
  if (me && !quiet) {
    if (me.prize) { S.balance += me.prize; toast(`Contest finished: you placed ${me.place}° and won ${euro(me.prize)}.`); } else toast(`Contest finished: you placed ${me.place}°.`);
  }
}
function addEntry(c, e, quiet) { c.entries.push(e); if (c.entries.length >= SEATS) settle(c, quiet); }
function botsArrive(hours) {
  for (const c of Object.values(S.contests)) {
    if (c.state !== 'open') continue;
    const n = Math.min(SEATS - c.entries.length, Math.floor(rnd() * 2 + hours * (0.25 + rnd() * 0.4)));
    for (let i = 0; i < n && c.state === 'open'; i++) addEntry(c, botEntry(S.now - rnd() * hours * HOUR));
  }
  for (const t of TICKETS) if (!Object.values(S.contests).some((c) => c.ticket === t && c.state === 'open')) newContest(t, S.now);
}

// ---------- the check ----------
/** The account's next real game; once they are all shown, one of its real games again. */
function nextRealGame() {
  const all = P().games;
  const g = S.cursor < all.length ? all[S.cursor++] : pick(all.slice(0, Math.floor(all.length * PAST_SHARE)));
  return { pair: g.pair, win: g.win, minutes: g.minutes, v: g.v };
}
const active = (s) => s.status === 'waiting' || s.status === 'unlocking';
/** Finds the games played since the last check and applies the rules, as the real check will. */
function runCheck({ daily = false, short = false } = {}) {
  const from = S.lastCheck;
  const elapsed = daily ? DAY : short ? (5 + rnd() * 25) * 60e3 : (2 + rnd() * 4) * HOUR;
  S.now += elapsed;
  const to = S.now;
  const n = short ? (rnd() < 0.3 ? 1 : 0) : daily ? 2 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2);
  const found = [];
  const span = (to - from) * 0.8; // games start in the window since the last check and end before this one
  for (let k = 0; k < n; k++) found.push({ ...nextRealGame(), start: from + ((k + 0.3 + rnd() * 0.5) / n) * span });
  for (const f of found) {
    const g = { id: uid('G'), ...f, note: '', signup: null, checked: to };
    const s = S.signups.filter((x) => active(x) && x.pair === f.pair && x.at < f.start && (x.status !== 'unlocking' || f.start < x.unlockAsked)).sort((a, b) => a.at - b.at)[0];
    if (!s) {
      const sameChamp = S.signups.some((x) => active(x) && splitPair(x.pair).champ === splitPair(f.pair).champ);
      g.note = sameChamp ? 'Same champion, different role: the pair must match exactly. Your sign-up keeps waiting.' : 'No sign-up waiting for this champion and role: judged for your profile only.';
    } else {
      const results = s.picks.map((p) => {
        const value = f.v[p.id] ?? valueAt(f.pair, p.id, f.win, 0.5, P().tier);
        return { ...p, value, ...score(f.pair, p, value, f.win, P().tier) };
      });
      Object.assign(g, { results, total: Math.round(results.reduce((a, r) => a + r.points, 0) * 10) / 10, signup: s.id });
      s.status = 'played'; s.gameId = g.id;
      if (s.kind === 'training') g.note = 'Training game: judged and added to your record.';
      else {
        S.balance -= s.ticket;
        let c = Object.values(S.contests).filter((x) => x.state === 'open' && x.ticket === s.ticket && !x.entries.some((e) => e.you)).sort((a, b) => b.entries.length - a.entries.length)[0];
        const opened = !c;
        if (!c) c = newContest(s.ticket, f.start);
        s.contestId = c.id;
        g.note = `${opened ? 'Opened a new contest' : 'Entered a contest'}${s.ticket ? `: ticket ${euro(s.ticket)} taken from your balance` : ''}.`;
        addEntry(c, { name: P().name, tier: P().tier, pair: f.pair, at: f.start, win: f.win, results, total: g.total, you: true });
        for (const o of S.signups) if (active(o) && o.kind === 'contest' && o.ticket > S.balance) { o.status = 'removed'; o.note = 'Removed: your balance no longer covers this ticket. Nothing was charged.'; }
      }
    }
    for (const m of S.milestones) {
      if (m.status !== 'active' || m.pair !== f.pair || f.v[m.id] == null) continue;
      if (f.v[m.id] >= lineOf(m.pair, m.id, m.level, f.win, P().tier)) {
        m.done++;
        if (m.done >= m.target) { m.status = 'reached'; m.reachedAt = to; S.points += m.points; toast(`Milestone reached: +${m.points} points.`); }
      }
    }
    S.games.push(g);
  }
  for (const s of S.signups) if (s.status === 'unlocking' && S.now >= s.unlockAt) { s.status = 'unlocked'; s.note = 'Unlocked: no valid game started before your request. Nothing was charged.'; }
  if (daily) for (const s of S.signups) if (s.status === 'waiting') { s.status = 'removed'; s.note = 'Removed by the daily check: not played. Nothing was charged.'; }
  botsArrive(elapsed / HOUR);
  S.lastCheck = to;
  save();
  return found.length;
}
function unlock(s) {
  const n = runCheck({ short: true });
  if (s.status === 'played') { toast(`The check found your game${n > 1 ? 's' : ''}: it entered the contest, so the unlock does not apply.`); return; }
  if (rnd() < 0.15) { s.note = 'Unlock refused: you were in a game at that moment. Try again when it ends.'; save(); toast('You are in a game right now: unlock refused.'); return; }
  Object.assign(s, { status: 'unlocking', unlockAsked: S.now, unlockAt: S.now + HOUR, note: `Unlock requested ${when(S.now)}: it takes effect at ${when(S.now + HOUR)} if no valid game started before the request.` });
  save(); toast('Unlock requested: it takes effect in 1 hour.');
}

// ---------- UI pieces ----------
let toastTimer;
function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 4200);
}
const area = (route) => (['contests', 'join', 'contest', 'verify'].includes(route) ? 'contest' : ['signin', 'signup'].includes(route) ? 'public' : 'free');
function chrome(route) {
  const h = location.hash || '#/';
  const a = S.profile == null ? 'public' : area(route);
  document.body.dataset.area = a;
  const link = ([href, name]) => `<a href="${href}" class="${h === href || (href.length > 2 && h.startsWith(href)) ? 'on' : ''}">${name}</a>`;
  let nav = '', right = '';
  if (a === 'public') {
    nav = [['#/rules', 'Rules'], ['#/data', 'Your data']].map(link).join('');
    right = '<a class="btn ghost small" href="#/signin">Sign in</a><a class="btn small" href="#/signup">Create account</a>';
  } else if (a === 'free') {
    nav = [['#/home', 'Home'], ['#/history', 'Match history'], ['#/train', 'Training'], ['#/milestones', 'Milestones'], ['#/rules', 'Rules']].map(link).join('');
    right = `<span class="pts" title="Skybreak points from milestones">${S.points} pts</span><a class="btn small" href="#/contests">Contest area</a>`;
  } else {
    nav = [['#/contests', 'Contests'], ['#/rules', 'Rules'], ['#/data', 'Your data']].map(link).join('') + '<a href="#/home">← Free area</a>';
    right = `<span class="bal">Balance <b>${euro(S.balance)}</b></span>`;
  }
  $('#top').innerHTML = `<div class="top-in"><a class="logo" href="${S.profile == null ? '../' : '#/home'}"><i></i>Skybreak${a === 'contest' ? '<em>Contests</em>' : ''}</a><nav>${nav}</nav><div class="wallet">${S.profile != null ? `<span class="who"><b>${esc(P().name)}</b>${tierName(P().tier)} · EUW</span>` : ''}${right}</div></div>`;
  $('#games-n').textContent = D.facts.games.toLocaleString('en-GB');
}
function needAccount() {
  if (S.profile != null) return false;
  location.hash = '#/signin';
  return true;
}
const statusTag = (s) => ({ waiting: '<span class="tag wait">waiting for your game</span>', unlocking: '<span class="tag wait">unlock pending (1 hour)</span>', played: '<span class="tag ok">played</span>', removed: '<span class="tag no">removed</span>', unlocked: '<span class="tag">unlocked</span>' }[s.status]);
const picksHtml = (picks) => picks.map((p) => `<span class="tag ${p.level}">${CH[p.id].name} · ${p.level}</span>`).join(' ');
function signupCard(s) {
  const actions = s.status === 'waiting' ? `<button class="btn ghost small" data-unlock="${s.id}">Unlock</button>` : '';
  const where = s.contestId ? `<a href="#/contest/${s.contestId}">See the contest</a>` : '';
  return `<div class="card"><div class="row">${icon(splitPair(s.pair).champ)}<div><b>${pairLabel(s.pair)}</b><div class="small muted">${s.kind === 'training' ? 'Training' : `${s.ticket ? euro(s.ticket) : 'Free'} contest`} · locked ${when(s.at)}</div></div></div>
    <p style="margin:10px 0">${picksHtml(s.picks)}</p><div class="row between">${statusTag(s)}${actions}</div>${s.note || where ? `<p class="small muted" style="margin-top:8px">${esc(s.note || '')} ${where}</p>` : ''}</div>`;
}
function checkBar(contest) {
  return `<div class="card hi checkbar"><div><h3>Checks</h3><p class="small muted">Last check ${when(S.lastCheck)}. The daily check also removes sign-ups not played yet${contest ? ', at no cost' : ''}.</p></div>
  <div class="row"><button class="btn" data-check="manual">Run a check</button><button class="btn ghost" data-check="daily">Skip to the daily check</button></div></div>`;
}

// ---------- public: sign in, create account ----------
function viewSignin() {
  app.innerHTML = `<div class="narrow"><h1>Sign in</h1><p class="sub">In the real product you sign in with Riot: Skybreak gets your Riot ID, region, rank tier and ranked games, never your password. In this demo, pick one of 5 real EUW players. Their games are real, their names are invented.</p>
  <div class="profiles">${PROFILES.map((p, i) => { const m = {}; for (const g of p.games) m[g.pair] = (m[g.pair] || 0) + 1; const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0][0];
    return `<button class="profile" data-profile="${i}">${icon(splitPair(top).champ, 'champ lg')}<span><b>${esc(p.name)}</b><span class="tier t-${p.tier.toLowerCase()}">${tierName(p.tier)}</span><span class="small muted">${p.role} · main ${pairLabel(top)} · ${p.games.length} games</span></span></button>`; }).join('')}</div>
  <p class="small muted" style="margin-top:18px">No account yet? <a href="#/signup">Create one</a>.</p></div>`;
  app.querySelectorAll('[data-profile]').forEach((b) => (b.onclick = () => signIn(Number(b.dataset.profile))));
}
function signIn(i) {
  const keep = S.signupForm;
  S = fresh();
  S.signupForm = keep;
  S.profile = i;
  const all = PROFILES[i].games;
  const past = Math.floor(all.length * PAST_SHARE);
  // the history keeps real results; its dates are moved so the last game was yesterday
  const shift = S.now - DAY - all[past - 1].start;
  S.games = all.slice(0, past).map((g, k) => ({ id: `H${k}`, pair: g.pair, win: g.win, minutes: g.minutes, v: g.v, start: g.start + shift, note: 'Before you joined: judged for your profile.', signup: null }));
  S.cursor = past;
  seedContests();
  save();
  location.hash = '#/home';
}
function viewSignup() {
  const f = S.signupForm || {};
  app.innerHTML = `<div class="narrow"><h1>Create your account</h1><p class="sub">A basic account is enough for training, milestones and free contests. Prize contests need a verified account, asked later in the contest area.</p>
  <form class="card form" id="su" novalidate>
    <div><label class="fld" for="em">Email</label><input type="email" id="em" autocomplete="email" value="${esc(f.email || '')}"></div>
    <div><label class="fld" for="pw">Password</label><input type="password" id="pw" autocomplete="new-password"></div>
    <div class="row"><div><label class="fld" for="co">Country</label><select id="co">${['Italy', 'France', 'Germany', 'Spain', 'United Kingdom', 'Other EU'].map((c) => `<option>${c}</option>`).join('')}</select></div>
    <div><label class="fld" for="la">Language</label><select id="la"><option>English</option><option>Italiano</option></select></div></div>
    <label class="check"><input type="checkbox" id="tos"> I accept the <a href="#/rules">rules</a> and the privacy terms.</label>
    <label class="check"><input type="checkbox" id="mk"> Send me news about Skybreak (optional).</label>
    <div class="step2"><b>Next: link your Riot account</b><p class="small muted">With Riot Sign On. In this demo you pick one of the 5 accounts.</p></div>
    <div class="row"><button class="btn" type="submit">Create account</button><a class="btn ghost" href="#/signin">Skip (demo)</a></div>
  </form></div>`;
  $('#su').onsubmit = (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test($('#em').value)) { toast('Type a valid email.'); return; }
    if ($('#pw').value.length < 8) { toast('The password needs at least 8 characters.'); return; }
    if (!$('#tos').checked) { toast('Accept the rules to continue.'); return; }
    S.signupForm = { email: $('#em').value, country: $('#co').value, language: $('#la').value, marketing: $('#mk').checked };
    save(); toast('Account created (demo). Now link your Riot account.'); location.hash = '#/signin';
  };
}

// ---------- free area ----------
function edgeChart(list) {
  if (!list.length) return '<p class="muted">Not enough games yet.</p>';
  const max = Math.max(0.15, ...list.map((e) => Math.abs(e.edge)));
  return `<div class="dchart" role="table" aria-label="Your success rate against the average player of your tier">${list.map((e) => {
    const w = (Math.abs(e.edge) / max) * 50;
    return `<div class="drow" role="row" title="${CH[e.id].name}: you ${pct(e.you)}, average ${pct(e.avg)} (${e.n} games, ${e.level})"><span class="dlab" role="cell">${CH[e.id].name}</span>
    <span class="dtrack" role="cell"><i class="${e.edge >= 0 ? 'up' : 'down'}" style="${e.edge >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`}"></i></span>
    <span class="dval" role="cell"><b>${e.edge >= 0 ? '+' : '−'}${Math.round(Math.abs(e.edge) * 100)}</b> <span class="muted">${pct(e.you)} vs ${pct(e.avg)}</span></span></div>`;
  }).join('')}</div>`;
}
let homePair = null;
function viewHome() {
  if (needAccount()) return;
  const p = P();
  const ms = mains().slice(0, 4);
  if (!homePair || !ms.some((m) => m.pair === homePair)) homePair = ms[0].pair;
  const all = edges(null);
  const strong = all.filter((e) => e.edge > 0.03).slice(0, 3), weak = all.filter((e) => e.edge < -0.03).slice(-3).reverse();
  const recent = S.games.slice().sort((a, b) => b.start - a.start).slice(0, 5);
  const waiting = S.signups.filter(active);
  const goals = S.milestones.filter((m) => m.status === 'active');
  app.innerHTML = `<div class="hello"><div><p class="eyebrow">${tierName(p.tier)} · ${p.role} · EUW</p><h1>Welcome, ${esc(p.name.split('#')[0])}</h1>
  <p class="sub">Your ${S.games.length} ranked games, judged against the average ${tierName(p.tier)} player with the same champion and role.</p></div>
  <div class="row"><a class="btn" href="#/train/new">Lock a training game</a><a class="btn ghost" href="#/milestones">Set a milestone</a></div></div>
  ${waiting.length ? `<div class="note">You have ${waiting.length} locked game${waiting.length > 1 ? 's' : ''} waiting. <a href="#/history">Run a check</a> after you play.</div>` : ''}
  <section class="card"><div class="row between"><h2 style="margin:0">Your mains against your tier</h2><div class="chips">${ms.map((m) => `<button class="chip ${m.pair === homePair ? 'on' : ''}" data-hp="${m.pair}">${pairLabel(m.pair)} · ${m.games}</button>`).join('')}</div></div>
  <p class="small muted" style="margin:6px 0 14px">How often you make each challenge (medium level where offered), minus how often the average ${tierName(p.tier)} player does. Right: above your tier. Left: below.</p>
  ${edgeChart(edges(homePair))}</section>
  <div class="grid2"><section class="card"><h3>Where you are strong</h3>${strong.length ? strong.map((e) => `<div class="tipline"><b>${CH[e.id].name}</b> <span class="tag ok">+${Math.round(e.edge * 100)} vs tier</span><p class="small muted">You make it ${pct(e.you)} of the time, the average ${pct(e.avg)}. Lock it in contests.</p></div>`).join('') : '<p class="muted small">No clear strength yet.</p>'}</section>
  <section class="card"><h3>What to work on</h3>${weak.length ? weak.map((e) => `<div class="tipline"><b>${CH[e.id].name}</b> <span class="tag no">${Math.round(e.edge * 100)} vs tier</span><p class="small">${esc(tip(e.id))}</p></div>`).join('') : '<p class="muted small">Nothing clearly below your tier.</p>'}</section></div>
  <div class="grid2"><section><h2>Recent games</h2>${recent.map(gameRow).join('')}<p><a href="#/history">All games</a></p></section>
  <section><h2>Milestones</h2>${goals.length ? goals.map(milestoneCard).join('') : '<p class="muted">No milestone yet. Pick a challenge you usually miss and earn points when you make it.</p>'}<p><a href="#/milestones">Set a milestone</a></p></section></div>
  <div class="card gold cta"><div><h3>Ready to compete?</h3><p class="small muted">Contests: 20 players, your own schedule, measured against your own tier. Free contests, and prize contests from 2 €.</p></div><a class="btn" href="#/contests">Enter the contest area</a></div>`;
  app.querySelectorAll('[data-hp]').forEach((b) => (b.onclick = () => { homePair = b.dataset.hp; const y = scrollY; viewHome(); scrollTo(0, y); }));
}
/** How many of the offered challenges the game made, at the reference level, on the account's tier lines. */
function madeCount(g) {
  let n = 0, of = 0;
  for (const id of Object.keys(offersOf(g.pair))) {
    const l = refLevel(g.pair, id), v = g.v[id];
    if (v == null) continue;
    of++; if (v >= lineOf(g.pair, id, l, g.win, P().tier)) n++;
  }
  return { n, of };
}
function gameRow(g) {
  const m = madeCount(g);
  return `<details class="game"><summary>${icon(splitPair(g.pair).champ)}<span class="g1"><b>${pairLabel(g.pair)}</b><span class="small muted">${day(g.start)} · ${g.minutes} min · <span class="${g.win ? 'w' : 'l'}">${g.win ? 'Win' : 'Loss'}</span></span></span>
  <span class="g2">${g.total != null ? `<span class="kpi" style="font-size:20px">${g.total}</span><span class="small muted">points</span>` : `<b>${m.n}/${m.of}</b><span class="small muted">challenges</span>`}</span></summary>
  <div class="gbody">${g.note ? `<p class="small">${esc(g.note)}${g.signup && S.signups.find((s) => s.id === g.signup)?.contestId ? ` <a href="#/contest/${S.signups.find((s) => s.id === g.signup).contestId}">Leaderboard</a>` : ''}</p>` : ''}
  ${g.results ? `<div class="tablewrap"><table><tr><th>Your pick</th><th>You</th><th>Line below</th><th>Level line</th><th>Points</th></tr>${g.results.map((r) => `<tr><td>${CH[r.id].name} <span class="tag ${r.level}">${r.level}</span></td><td>${fmt(r.id, r.value)}</td><td>${fmt(r.id, r.lo)}</td><td>${fmt(r.id, r.hi)}</td><td>${r.full ? `<b>${r.points}</b> made it` : r.frac > 0 ? `<b>${r.points}</b> (${Math.round(r.frac * 100)}% of the way)` : '0'}</td></tr>`).join('')}</table></div>` : ''}
  <div class="tablewrap"><table><tr><th>Challenge</th><th>You</th><th>Easy</th><th>Medium</th><th>Hard</th></tr>${Object.keys(offersOf(g.pair)).map((id) => `<tr><td>${CH[id].name}</td><td>${fmt(id, g.v[id])}</td>${LEVELS.map((l) => { const line = lineOf(g.pair, id, l, g.win, P().tier); return `<td>${line == null ? '<span class="muted">—</span>' : `<span class="${g.v[id] != null && g.v[id] >= line ? 'hit' : 'muted'}">${fmt(id, line)}</span>`}</td>`; }).join('')}</tr>`).join('')}</table></div>
  <p class="small muted">Highlighted: the lines you reached in this game, for a ${tierName(P().tier)} player.</p></div></details>`;
}
function viewHistory() {
  if (needAccount()) return;
  const list = S.games.slice().sort((a, b) => b.start - a.start);
  const waiting = S.signups.filter(active);
  app.innerHTML = `<h1>Match history</h1><p class="sub">Every ranked solo game of your account, judged against your tier. Open a game to see every line. If a game did not count for a sign-up, it says why.</p>
  ${checkBar(false)}${waiting.length ? `<h2>Waiting for your game</h2><div class="grid">${waiting.map(signupCard).join('')}</div>` : ''}
  <h2>Games (${list.length})</h2>${list.map(gameRow).join('')}`;
}
function viewTrain() {
  if (needAccount()) return;
  const mine = S.signups.filter((s) => s.kind === 'training').slice().reverse();
  app.innerHTML = `<div class="hello"><div><h1>Training</h1><p class="sub">Free, as many games as you like. Lock a champion, a role and 3 challenges, play, and the check judges the game exactly like a contest game.</p></div><a class="btn" href="#/train/new">Lock a training game</a></div>
  ${checkBar(false)}<h2>Your training games</h2>${mine.length ? `<div class="grid">${mine.map(signupCard).join('')}</div>` : '<p class="muted">None yet.</p>'}`;
}
function milestoneCard(m) {
  return `<div class="card ms"><div class="row">${icon(splitPair(m.pair).champ)}<div style="flex:1"><b>${CH[m.id].name}</b> <span class="tag ${m.level}">${m.level}</span><div class="small muted">${pairLabel(m.pair)} · ${m.target} time${m.target > 1 ? 's' : ''} · +${m.points} points</div></div>${m.status === 'reached' ? '<span class="tag ok">reached</span>' : `<b>${m.done}/${m.target}</b>`}</div>
  <div class="bar" style="margin-top:10px"><i style="width:${(m.done / m.target) * 100}%"></i></div></div>`;
}
let msDraft = null;
function viewMilestones() {
  if (needAccount()) return;
  const ms = mains().slice(0, 6);
  if (!msDraft) msDraft = { pair: ms[0].pair, id: null, level: null, target: 2 };
  const r = rec();
  const offers = offersOf(msDraft.pair);
  const options = Object.keys(offers).flatMap((id) => LEVELS.filter((l, i) => offers[id][i] != null).map((l) => ({ id, level: l, t: r[`${msDraft.pair}#${id}#${l}`] })))
    .map((o) => ({ ...o, rate: o.t && o.t.n ? o.t.hits / o.t.n : null })).sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1));
  const sel = options.find((o) => o.id === msDraft.id && o.level === msDraft.level);
  const pts = sel ? POINTS[sel.level] * msDraft.target : 0;
  app.innerHTML = `<h1>Milestones</h1><p class="sub">Pick a challenge you usually miss with one of your champions. Make it the number of times you choose, in your normal ranked games, and you earn Skybreak points. Points are not money.</p>
  <div class="card"><h3>New milestone</h3><label class="fld">Champion and role</label><div class="chips">${ms.map((m) => `<button class="chip ${m.pair === msDraft.pair ? 'on' : ''}" data-mp="${m.pair}">${pairLabel(m.pair)}</button>`).join('')}</div>
  <label class="fld" style="margin-top:14px">Challenge and level <span class="muted">(the ones you make least come first)</span></label>
  <div class="opts">${options.map((o) => `<button class="opt ${sel === o ? 'on' : ''}" data-mi="${o.id}" data-ml="${o.level}"><b>${CH[o.id].name}</b> <span class="tag ${o.level}">${o.level}</span><span class="small muted">${o.rate == null ? 'not measured yet' : `you: ${pct(o.rate)} of ${o.t.n} games · average ${pct(TARGET[o.level])}`}</span></button>`).join('')}</div>
  <div class="row" style="margin-top:14px"><label class="fld" for="mt" style="margin:0">Times</label><select id="mt">${[1, 2, 3, 5].map((n) => `<option ${n === msDraft.target ? 'selected' : ''}>${n}</option>`).join('')}</select>
  <span class="muted small">${sel ? `${CH[sel.id].name} ${sel.level} with ${pairLabel(msDraft.pair)}, ${msDraft.target} time${msDraft.target > 1 ? 's' : ''}: <b style="color:var(--beam)">+${pts} points</b>` : 'Pick a challenge.'}</span>
  <button class="btn" id="msgo" ${sel ? '' : 'disabled'}>Set milestone</button></div></div>
  <h2>Your milestones</h2>${S.milestones.length ? `<div class="grid">${S.milestones.slice().reverse().map(milestoneCard).join('')}</div>` : '<p class="muted">None yet.</p>'}
  <p class="small muted">Every ranked game with that champion and role counts, not only locked ones. You have <b>${S.points}</b> points.</p>`;
  app.querySelectorAll('[data-mp]').forEach((b) => (b.onclick = () => { msDraft = { ...msDraft, pair: b.dataset.mp, id: null, level: null }; viewMilestones(); }));
  app.querySelectorAll('[data-mi]').forEach((b) => (b.onclick = () => { msDraft.id = b.dataset.mi; msDraft.level = b.dataset.ml; const y = scrollY; viewMilestones(); scrollTo(0, y); }));
  $('#mt').onchange = (e) => { msDraft.target = Number(e.target.value); const y = scrollY; viewMilestones(); scrollTo(0, y); };
  const go = $('#msgo');
  if (go) go.onclick = () => { if (!sel) return; S.milestones.push({ id: sel.id, level: sel.level, pair: msDraft.pair, target: msDraft.target, done: 0, points: pts, status: 'active', at: S.now }); msDraft = null; save(); toast('Milestone set: play your games, the check counts them.'); viewMilestones(); };
}

// ---------- picking a pair and 3 challenges: training and contests ----------
let draft = null;
function viewPick(kind, ticket) {
  if (needAccount()) return;
  const p = P();
  if (kind === 'contest' && ticket > 0 && !S.verified) { location.hash = '#/verify'; return; }
  const ms = mains();
  const champs = [...new Set([...ms.map((m) => splitPair(m.pair).champ), ...pairKeys.map((k) => splitPair(k).champ).sort((a, b) => champName(a).localeCompare(champName(b)))])];
  if (!draft || draft.kind !== kind || draft.ticket !== ticket) {
    const first = ms[0].pair;
    draft = { kind, ticket, champ: splitPair(first).champ, pair: first, picks: [] };
  }
  const rolesOf = (c) => Object.keys(ROLES).filter((r) => D.pairs[`${r}|${c}`]);
  const r = rec();
  const offers = offersOf(draft.pair);
  const pts = draft.picks.reduce((a, x) => a + POINTS[x.level], 0);
  const strong = ms.slice(0, 3).map((m) => ({ ...m, best: edges(m.pair).filter((e) => e.edge > 0).slice(0, 3) }));
  const title = kind === 'training' ? 'Lock a training game' : ticket ? `Sign up · ${euro(ticket)} contest` : 'Sign up · free contest';
  const ci = champs.indexOf(draft.champ);
  app.innerHTML = `<h1>${title}</h1><p class="sub">${kind === 'training' ? 'Free. Judged exactly like a contest game.' : 'Nothing is charged now: the ticket is taken only when the check finds your next game with this champion and role.'} Thresholds are those of ${/^[AEIOU]/.test(p.tier) ? 'an' : 'a'} ${tierName(p.tier)} player.</p>
  <div class="carousel" aria-label="Champions"><button class="cnav" data-cstep="-1" aria-label="Previous champion">‹</button><div class="ctrack" id="ctrack">${champs.map((c, i) => `<button class="citem ${i === ci ? 'on' : ''}" data-champ="${c}" style="--d:${Math.min(3, Math.abs(i - ci))}">${icon(c)}<span>${champName(c)}</span></button>`).join('')}</div><button class="cnav" data-cstep="1" aria-label="Next champion">›</button></div>
  <div class="row" style="justify-content:center;margin:8px 0 4px">${rolesOf(draft.champ).map((ro) => `<button class="chip ${draft.pair === `${ro}|${draft.champ}` ? 'on' : ''}" data-role="${ro}">${ROLES[ro]}</button>`).join('')}</div>
  <p class="small muted" style="text-align:center">${(ms.find((m) => m.pair === draft.pair) || { games: 0 }).games} of your games with ${pairLabel(draft.pair)}</p>
  <h2>Your strongest pairs</h2><div class="grid">${strong.map((s) => `<button class="card strong ${draft.pair === s.pair ? 'on' : ''}" data-strong="${s.pair}"><div class="row">${icon(splitPair(s.pair).champ)}<div><b>${pairLabel(s.pair)}</b><div class="small muted">${s.games} games</div></div></div><div style="margin-top:8px">${s.best.length ? s.best.map((e) => `<span class="tag ok">${CH[e.id].name} +${Math.round(e.edge * 100)}</span>`).join(' ') : '<span class="small muted">no clear strength yet</span>'}</div></button>`).join('')}</div>
  <h2 id="step2" style="scroll-margin-top:90px">Three challenges for ${pairLabel(draft.pair)}</h2><p class="muted small">Any mix of levels. Easy ${POINTS.easy}, medium ${POINTS.medium}, hard ${POINTS.hard} points. Under each level: how often you made it.</p>
  <div class="grid chgrid">${D.challenges.filter((c) => offers[c.id]).map((c) => {
    const chosen = draft.picks.find((x) => x.id === c.id);
    return `<div class="ch ${chosen ? 'on' : ''}"><div class="row between"><h3>${c.name}</h3><span class="tag">${c.family}</span></div>
    <p class="small muted">${challengeText(draft.pair, c.id, chosen ? chosen.level : LEVELS.find((l) => offers[c.id][LEVELS.indexOf(l)] != null), p.tier)}</p>
    <div class="levels">${LEVELS.map((l, i) => { const t = r[`${draft.pair}#${c.id}#${l}`]; const off = offers[c.id][i] == null; return `<button class="lv ${chosen && chosen.level === l ? 'on' : ''}" data-ch="${c.id}" data-lv="${l}" ${off ? 'disabled title="Not offered: not fair enough for this pair at this level"' : ''}><b>${l} · ${POINTS[l]}</b>${off ? 'not offered' : `${fmt(c.id, lineOf(draft.pair, c.id, l, true, p.tier))}<span class="you">${t && t.n >= 3 ? `you ${pct(t.hits / t.n)}` : '&nbsp;'}</span>`}</button>`; }).join('')}</div></div>`;
  }).join('')}</div>
  <div class="card hi lockbar"><div class="row between"><div><b>${draft.picks.length}/3 challenges</b> · up to ${pts} points<div style="margin-top:6px">${picksHtml(draft.picks)}</div></div>
  <button class="btn" id="lock" ${draft.picks.length === 3 ? '' : 'disabled'}>${kind === 'training' ? 'Lock and train' : 'Lock and sign up'}</button></div>
  ${kind === 'contest' && ticket > S.balance ? `<p class="small" style="color:var(--bad);margin-top:8px">Your balance (${euro(S.balance)}) does not cover this ticket.</p>` : ''}</div>`;
  const tr = $('#ctrack'), on = tr.querySelector('.citem.on');
  if (on) tr.scrollLeft = on.offsetLeft - tr.clientWidth / 2 + on.clientWidth / 2;
  const setChamp = (c) => {
    const roles = rolesOf(c);
    const mine = ms.find((m) => splitPair(m.pair).champ === c);
    draft.champ = c; draft.pair = mine ? mine.pair : `${roles[0]}|${c}`; draft.picks = [];
    const y = scrollY; viewPick(kind, ticket); scrollTo(0, y);
  };
  app.querySelectorAll('[data-champ]').forEach((b) => (b.onclick = () => setChamp(b.dataset.champ)));
  app.querySelectorAll('[data-cstep]').forEach((b) => (b.onclick = () => setChamp(champs[(ci + Number(b.dataset.cstep) + champs.length) % champs.length])));
  app.querySelectorAll('[data-role]').forEach((b) => (b.onclick = () => { draft.pair = `${b.dataset.role}|${draft.champ}`; draft.picks = []; const y = scrollY; viewPick(kind, ticket); scrollTo(0, y); }));
  app.querySelectorAll('[data-strong]').forEach((b) => (b.onclick = () => {
    const s = strong.find((x) => x.pair === b.dataset.strong);
    draft.pair = s.pair; draft.champ = splitPair(s.pair).champ;
    draft.picks = s.best.map((e) => ({ id: e.id, level: e.level }));
    viewPick(kind, ticket); $('#step2').scrollIntoView({ block: 'start' });
  }));
  app.querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => {
    const { ch, lv } = b.dataset;
    const at = draft.picks.findIndex((x) => x.id === ch);
    if (at >= 0 && draft.picks[at].level === lv) draft.picks.splice(at, 1);
    else if (at >= 0) draft.picks[at].level = lv;
    else if (draft.picks.length < 3) draft.picks.push({ id: ch, level: lv });
    else { toast('Three challenges: remove one first.'); return; }
    const y = scrollY; viewPick(kind, ticket); scrollTo(0, y);
  }));
  const lock = $('#lock');
  if (lock) lock.onclick = () => {
    if (kind === 'contest' && ticket > S.balance) { toast('You need at least one ticket in your balance to sign up.'); return; }
    S.signups.push({ id: uid('S'), kind, ticket: kind === 'training' ? 0 : ticket, pair: draft.pair, picks: draft.picks.map((x) => ({ ...x })), at: S.now, status: 'waiting' });
    draft = null; save(); toast('Locked. Play your game: the next check will find it.');
    location.hash = kind === 'training' ? '#/train' : '#/contests';
  };
}

// ---------- contest area ----------
function contestCard(c) {
  const me = c.entries.find((e) => e.you);
  const rows = [...c.entries].sort((a, b) => b.total - a.total);
  const place = me ? (c.state === 'done' ? me.place : rows.findIndex((e) => e.total === me.total) + 1) : null;
  return `<a class="card ccard" href="#/contest/${c.id}"><div class="row between"><h3>${c.ticket ? euro(c.ticket) : 'Free'} contest</h3><span class="tag ${c.state === 'open' ? 'wait' : 'ok'}">${c.state === 'open' ? 'open' : 'finished'}</span></div>
  <div class="bar" style="margin:10px 0 6px"><i style="width:${(c.entries.length / SEATS) * 100}%"></i></div>
  <p class="small muted">${c.entries.length} of ${SEATS} games${me ? ` · you: ${me.total} pts, ${c.state === 'done' ? '' : 'now '}${place}°${me.prize ? `, won ${euro(me.prize)}` : ''}` : ''}</p></a>`;
}
function viewContests() {
  if (needAccount()) return;
  const mineOpen = Object.values(S.contests).filter((c) => c.state === 'open' && c.entries.some((e) => e.you));
  const mineDone = Object.values(S.contests).filter((c) => c.state === 'done' && c.entries.some((e) => e.you)).sort((a, b) => b.closedAt - a.closedAt);
  const waiting = S.signups.filter((s) => s.kind === 'contest' && active(s));
  const past = S.signups.filter((s) => s.kind === 'contest' && !active(s)).slice(-6).reverse();
  const open = Object.values(S.contests).filter((c) => c.state === 'open' && !c.entries.some((e) => e.you));
  app.innerHTML = `<div class="walletbar"><div><p class="eyebrow">Your balance</p><div class="big">${euro(S.balance)}</div><p class="small muted">Play money in this demo. The ticket is taken only when your game enters a contest.</p></div>
  <div class="row"><button class="btn ghost" disabled title="Not in the demo">Add funds</button><button class="btn ghost" disabled title="Not in the demo">Withdraw</button></div></div>
  ${S.verified ? '' : '<div class="note">Prize contests need a verified account. <a href="#/verify">Verify your identity</a>. Free contests are open to everyone.</div>'}
  <div class="note warn"><b>Fair play.</b> Zero tolerance: abuse is punished directly, and the ban is on you as a person, not on your game account. No smurfs, no shared accounts.</div>
  <h2>Join a contest</h2><div class="grid">${TICKETS.map((t) => { const off = t > S.balance || (t > 0 && !S.verified); return `<div class="card ctype ${t ? 'hi' : ''}"><div class="row between"><h3>${t ? `${euro(t)} contest` : 'Free contest'}</h3><span class="tag gold">${t ? `1st ${euro(t * 2)}` : 'no prizes'}</span></div>
    ${t ? `<div class="plist"><span>1st-4th</span><b>${euro(t * 2)} to ${euro(t * 1.2)}</b><span>5th-12th</span><b>${euro(t)} back</b><span>13th-14th</span><b>${euro(t * 0.8)}</b></div>` : '<div class="plist"><span>Prizes</span><b>none</b><span>Account</span><b>basic is enough</b></div>'}
    ${off ? `<button class="btn" disabled>${t > S.balance ? 'Balance too low' : 'Verify to join'}</button>` : `<a class="btn" href="#/join/${t}">Sign up</a>`}</div>`; }).join('')}</div>
  ${checkBar(true)}
  <h2>Waiting for your game (${waiting.length})</h2>${waiting.length ? `<div class="grid">${waiting.map(signupCard).join('')}</div>` : '<p class="muted">Nothing locked.</p>'}
  ${mineOpen.length ? `<h2>Your contests in progress</h2><div class="grid">${mineOpen.map(contestCard).join('')}</div>` : ''}
  ${mineDone.length ? `<h2>Your finished contests</h2><div class="grid">${mineDone.map(contestCard).join('')}</div>` : ''}
  ${past.length ? `<h2>Past sign-ups</h2><div class="grid">${past.map(signupCard).join('')}</div>` : ''}
  <h2>Other open contests</h2><div class="grid">${open.map(contestCard).join('')}</div>
  <div class="card tips"><h3>Good to know</h3><ul class="small">
  <li>Sign up to several contests at once: each one waits for your next game with its champion and role.</li>
  <li>Your balance can never fall short: when a game enters a contest, sign-ups your balance no longer covers are removed, at no cost.</li>
  <li>Unlocking runs a check at once. If you are in a game, it is refused; otherwise it takes effect after 1 hour.</li>
  <li>Lock challenges you are strong at: your home shows them, against your own tier.</li></ul></div>`;
}
function viewVerify() {
  if (needAccount()) return;
  app.innerHTML = `<div class="narrow"><h1>Verify your identity</h1><p class="sub">Prize contests need a verified account: one person, one account. Your details are never shown to other players; in contests they see only your Riot ID.</p>
  <form class="card form" id="vf" novalidate>
    <div class="row"><div><label class="fld" for="fn">First name</label><input type="text" id="fn" autocomplete="given-name"></div><div><label class="fld" for="ln">Last name</label><input type="text" id="ln" autocomplete="family-name"></div></div>
    <div><label class="fld" for="dob">Date of birth</label><input type="date" id="dob" autocomplete="bday"></div>
    <div><label class="fld" for="ad">Address</label><input type="text" id="ad" autocomplete="street-address"></div>
    <div class="row"><div><label class="fld" for="ci">City</label><input type="text" id="ci" autocomplete="address-level2"></div><div><label class="fld" for="pc">Postal code</label><input type="text" id="pc" autocomplete="postal-code"></div></div>
    <div><label class="fld" for="dt">Document</label><select id="dt"><option>ID card</option><option>Passport</option><option>Driving licence</option></select><p class="small muted" style="margin-top:6px">In the real product the document is checked by an identity provider; Skybreak keeps only the result.</p></div>
    <div class="row"><button class="btn" type="submit">Verify</button><button class="btn ghost" type="button" id="skip">Skip (demo)</button><a href="#/contests">Back</a></div>
  </form></div>`;
  const done = () => { S.verified = true; save(); toast('Account verified (demo). Prize contests are open.'); location.hash = '#/contests'; };
  $('#vf').onsubmit = (e) => { e.preventDefault(); if (!$('#fn').value || !$('#ln').value || !$('#dob').value) { toast('Fill in name and date of birth, or skip.'); return; } done(); };
  $('#skip').onclick = done;
}
function viewContest(id) {
  const c = S.contests[id];
  if (!c) { app.innerHTML = '<p>Contest not found. <a href="#/contests">Contests</a></p>'; return; }
  const rows = [...c.entries].sort((a, b) => (c.state === 'done' ? a.place - b.place : b.total - a.total || a.at - b.at));
  const placeOf = (i) => (c.state === 'done' ? rows[i].place : rows.findIndex((e) => e.total === rows[i].total) + 1);
  const tied = (i) => rows.some((e, j) => j !== i && e.total === rows[i].total);
  const zone = (p) => (!c.ticket ? '' : PRIZE_X[p - 1] > 1 ? 'z-top' : PRIZE_X[p - 1] === 1 ? 'z-back' : PRIZE_X[p - 1] > 0 ? 'z-part' : '');
  const cut = (i) => c.ticket && (i === 3 || i === 11 || i === 13) && i < rows.length - 1;
  app.innerHTML = `<p><a href="#/contests">← Contests</a></p><div class="hello"><div><h1>${c.ticket ? euro(c.ticket) : 'Free'} contest</h1>
  <p class="sub">${c.state === 'open' ? `Open: ${c.entries.length} of ${SEATS} games. Provisional leaderboard, it changes as games come in.` : `Finished: final leaderboard${c.ticket ? `, ${euro(c.pool)} in prizes (80% of tickets)` : ''}.`} Players appear with their Riot ID only. Everyone is measured against their own tier, champion and role.</p></div>
  <div class="counter"><b>${c.entries.length}</b><span>of ${SEATS}</span></div></div>
  <table class="lb"><tr class="head"><th>#</th><th>Player</th><th>Challenges</th><th style="text-align:right">Points</th></tr>
  ${rows.map((e, i) => `<tr class="${e.you ? 'you' : ''} ${zone(placeOf(i))} ${cut(i) ? 'cut' : ''}"><td><span class="place">${tied(i) ? '=' : ''}${placeOf(i)}</span></td>
  <td><div class="row" style="flex-wrap:nowrap">${icon(splitPair(e.pair).champ)}<div><b>${esc(e.name)}</b>${e.you ? ' <span class="tag gold">you</span>' : ''}<div class="small muted">${tierName(e.tier)} · ${pairLabel(e.pair)}</div></div></div></td>
  <td class="small chs">${e.results.map((r) => `<div>${CH[r.id].name} <span class="tag ${r.level}">${r.level}</span> ${fmt(r.id, r.value)} → <b>${r.points}</b></div>`).join('')}</td>
  <td class="pts"><span class="kpi" style="font-size:20px">${e.total}</span>${c.state === 'done' && c.ticket ? `<div class="small ${e.prize ? '' : 'muted'}">${e.prize ? euro(e.prize) : 'no prize'}</div>` : ''}</td></tr>`).join('')}</table>
  ${c.ticket ? '<div class="legend"><span style="--c:var(--beam)">1st-4th: more than the ticket</span><span style="--c:#3a3424">5th-12th: ticket back</span><span style="--c:#2a2720">13th-14th: 80%</span><span style="--c:var(--panel2)">15th-20th: nothing</span></div>' : ''}
  <p class="small muted" style="margin-top:8px">“=” marks a tie: tied players share the prizes of the places they hold.</p>`;
}

// ---------- rules and data ----------
function viewRules() {
  const sec = [['r-what', 'What Skybreak is'], ['r-acc', 'Accounts'], ['r-free', 'The free system'], ['r-ch', 'Challenges and points'], ['r-contest', 'Prize contests'], ['r-fair', 'Fair play'], ['r-data', 'Your data'], ['r-change', 'Changes']];
  app.innerHTML = `<div class="rules"><h1>Rules</h1><p class="sub">The same for everyone, public before you sign up, changed only with notice.</p>
  <nav class="toc">${sec.map(([id, n], i) => `<a href="#/rules" data-go="${id}">${i + 1}. ${n}</a>`).join('')}</nav>
  <h2 id="r-what">1. What Skybreak is</h2><p>Skybreak measures how far above your level you play League of Legends, game after game. Before a ranked solo game you pick a champion, a role and 3 challenges; after the game Skybreak judges it against the average player of your tier with that champion and role. Two products on the same judgement:</p>
  <ul><li><b>The free system:</b> training, your profile of strengths and weaknesses, milestones. Always free.</li><li><b>Prize contests:</b> 20 players, each plays when they want, and the best performance against their own tier wins.</li></ul><p>Nothing appears on your screen during the game: no overlay, no pop-ups.</p>
  <h2 id="r-acc">2. Accounts</h2><div class="tablewrap"><table><tr><th></th><th>Basic account</th><th>Verified account</th></tr><tr><td>For</td><td>the free system and free contests</td><td>prize contests and the wallet</td></tr><tr><td>Needs</td><td>email, password, your Riot account linked with Riot Sign On</td><td>also a verified identity: name, date of birth, address, a document</td></tr></table></div>
  <ul><li>One person has one Skybreak account and one linked Riot account.</li><li>Skybreak never asks for your Riot password.</li><li>In contests, other players see only your Riot ID, never your personal details.</li></ul>
  <h2 id="r-free">3. The free system</h2><ul><li><b>Training:</b> lock a champion, a role and 3 challenges as in a contest; the game is judged and goes into your record. As many as you like.</li><li><b>Profile:</b> for your main champions, the challenges where you are above or below the average player of your tier, with tips to improve.</li><li><b>Milestones:</b> pick a champion and role, a challenge and a level you usually miss, and how many times. Make it and you earn Skybreak points. Points cannot be turned into money.</li></ul>
  <h2 id="r-ch">4. Challenges and points</h2><ul><li><b>Fair</b> means a challenge happens as often as declared to anyone who plays that champion, in that role, at that tier, whether the game is won or lost. <b>Real</b> means better players make it happen more often.</li>
  <li><b>Levels:</b> easy, the average player makes it in about 6 games out of 10; medium, about 1 in 3; hard, about 1 in 7. Points: ${POINTS.easy}, ${POINTS.medium}, ${POINTS.hard}.</li>
  <li><b>Thresholds</b> are the same for everyone, per champion, role and tier, computed on everyone's public ranked games and never on yours. A challenge is offered to a pair only if it passes every test.</li>
  <li><b>Window scoring:</b> reach the line of the chosen level and you get all its points; between the line below and that line, points grow in proportion; below it, nothing. Never more than the chosen level.</li><li>The score of a game is the sum of its 3 challenges.</li></ul>
  <p class="small muted">How we measure: on ${D.facts.games.toLocaleString('en-GB')} ranked games (EUW), with thresholds fixed on older games and tested on newer ones, challenges happened 60.1%, 35.1% and 15.0% of the time. A player's results on odd and even games correlate ${D.facts.follow.toFixed(2)}; winning alone, ${D.facts.wins.toFixed(2)}. Picking the luckiest champion gives at most ×${D.facts.edgeChampion.toFixed(2)}.</p>
  <div class="tablewrap"><table><tr><th>Challenge</th><th>What it measures</th></tr>${D.challenges.map((c) => `<tr><td><b>${c.name}</b><br><span class="small muted">${c.family}</span></td><td class="small">${c.text.replace(/\{x\}|\{xl\}/g, '<i>threshold</i>').replace(/\{y\d0\}/g, '…')}</td></tr>`).join('')}</table></div>
  <h2 id="r-contest">5. Prize contests</h2>
  <p><b>The wallet.</b> Your balance is in euro. A ticket is taken from it only when your game enters a contest; until then the balance stays yours and free.</p>
  <div class="tablewrap"><table><tr><th>Contest</th><th>Ticket</th><th>Prizes</th></tr><tr><td>Free</td><td>0</td><td>none: the leaderboard</td></tr><tr><td>2 €, 5 €, 10 €</td><td>2 €, 5 €, 10 €</td><td>80% of the tickets go to the players</td></tr></table></div>
  <p><b>Signing up and playing.</b></p><ol><li>Sign up to one or more contests. For each, lock a champion, a role and 3 challenges; the time is saved. After locking nothing changes. Nothing is charged.</li>
  <li>Play. Your first ranked solo game with exactly that champion and role, started after the sign-up, is your game for that contest.</li>
  <li>The check finds it: once a day for everyone with a sign-up, or whenever you press “Run a check”. Sign-ups not played by the daily check are removed, at no cost.</li>
  <li>The game enters an open contest where you are not already, or opens a new one. That is when the ticket is taken.</li></ol>
  <ul><li>Your balance can never fall short: after each game enters, sign-ups the remaining balance does not cover are removed.</li><li>Several sign-ups with the same pair go in order: the first game to the first sign-up. Each game counts for one contest; you are never twice in the same contest.</li></ul>
  <p><b>Unlocking a sign-up.</b></p><ul><li>You can unlock a sign-up until its game has entered a contest. Unlocking runs a check at once.</li><li>If the check finds a valid game started after the sign-up, it enters the contest and the unlock does not apply.</li><li>If you are in a game at that moment, the unlock is refused: try again when it ends.</li><li>Otherwise the unlock takes effect after 1 hour, if no valid game started before your request. Your balance is not held during that hour.</li></ul>
  <p><b>The contest.</b></p><ul><li>20 seats. It lasts until 20 games have entered; then final leaderboard and prizes.</li><li>While it is open you see the counter (for example 13 of 20) and the provisional leaderboard, with the other players' Riot IDs and their results challenge by challenge.</li><li>If it does not reach 20 games within the maximum time, it is cancelled and every ticket goes back to your balance.</li></ul>
  <div class="tablewrap"><table><tr><th>Case</th><th>Rule</th></tr><tr><td>Remakes, games under 10 minutes</td><td>Do not count: no ticket taken, the sign-up keeps waiting.</td></tr><tr><td>Dodge</td><td>Not a game: nothing happens.</td></tr><tr><td>Surrender</td><td>Counts normally: a win for the winners, a loss for the side that surrendered.</td></tr><tr><td>Normal, flex, ARAM</td><td>Do not count.</td></tr></table></div>
  <div class="tablewrap"><table><tr><th>Place</th><th>Prize</th><th>2 €</th><th>5 €</th><th>10 €</th></tr>${[['1st', 2], ['2nd', 1.7], ['3rd', 1.5], ['4th', 1.2], ['5th-12th', 1], ['13th-14th', 0.8], ['15th-20th', 0]].map(([n, x]) => `<tr><td>${n}</td><td>${x ? `×${x}` : '—'}${x === 1 ? ', ticket back' : ''}</td>${[200, 500, 1000].map((t) => `<td>${euro(t * x)}</td>`).join('')}</tr>`).join('')}</table></div>
  <p><b>Ties:</b> players on the same points add up the prizes of the places they hold and split them equally.</p>
  <h2 id="r-fair">6. Fair play</h2><p>Zero tolerance on contest fair play: abuse is punished directly. No smurfs, no accounts shared or played by someone else. The ban is on the person, not on the game account.</p>
  <h2 id="r-data">7. Your data</h2><ul><li>Skybreak reads from Riot, through the official API and after you sign in with Riot: Riot ID, region, rank tier and your ranked solo games. Nothing during the game.</li><li>We keep your sign-ups, the games the checks found and how they were judged, your contests, your balance and its movements.</li><li>No player ratings, no data sold, nobody's personal details shown.</li><li>You can download your data and ask for it to be deleted. <a href="#/data">Your data</a></li></ul>
  <h2 id="r-change">8. Changes</h2><p>The rules are the same for everyone and public before you sign up. They change only with notice; a contest already open finishes under the rules it started with.</p></div>`;
  app.querySelectorAll('[data-go]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); document.getElementById(a.dataset.go).scrollIntoView({ behavior: 'smooth' }); }));
}
function viewData() {
  const signed = S.profile != null;
  const pair = (S._dataPair && D.pairs[S._dataPair]) ? S._dataPair : signed ? mains()[0].pair : 'MIDDLE|Ahri';
  const tier = S._dataTier || (signed ? P().tier : 'GOLD');
  app.innerHTML = `<h1>Your data</h1><p class="sub">Your games are yours. Here is everything Skybreak reads, keeps and computes, and every threshold in use.</p>
  <div class="grid"><div class="card"><h3>What we read from Riot</h3><p class="small muted">Through Riot's official API, after you sign in with Riot: Riot ID, region, rank tier and your ranked solo games (champion, role, start, length, result and the statistics the challenges need). Nothing during the game.</p></div>
  <div class="card"><h3>What we keep</h3><p class="small muted">Your account, sign-ups, the games the checks found and how each was judged, contests, milestones, balance and its movements. For verified accounts, the result of the identity check.</p></div>
  <div class="card"><h3>What we never do</h3><p class="small muted">No player ratings, no data sold, no personal details shown to other players, nothing shown during your game.</p></div></div>
  <h2>Every threshold</h2><div class="row" style="margin-bottom:10px"><select id="dp">${pairKeys.map((k) => `<option value="${k}" ${k === pair ? 'selected' : ''}>${pairLabel(k)}</option>`).join('')}</select><select id="dtr">${TIERS.map((t) => `<option value="${t}" ${t === tier ? 'selected' : ''}>${tierName(t)}</option>`).join('')}</select><span class="small muted">The real catalog (${D.generated}), with the correction for the tier.</span></div>
  <div class="tablewrap"><table><tr><th>Challenge</th><th>Easy</th><th>Medium</th><th>Hard</th></tr>${D.challenges.map((c) => `<tr><td>${c.name}</td>${LEVELS.map((l) => { const w = lineOf(pair, c.id, l, true, tier), lo = lineOf(pair, c.id, l, false, tier); return `<td>${w == null ? '<span class="muted">not offered</span>' : Array.isArray((offersOf(pair)[c.id] || [])[LEVELS.indexOf(l)]) ? `${fmt(c.id, w)} win · ${fmt(c.id, lo)} loss` : fmt(c.id, w)}</td>`; }).join('')}</tr>`).join('')}</table></div>
  ${signed ? `<h2>Everything this demo stored about you</h2><p class="small muted">In this demo it lives only in your browser.</p><div class="row"><button class="btn ghost" id="dl">Download my data (JSON)</button><button class="btn ghost" id="out">Sign out</button><button class="btn ghost" id="reset">Reset the demo</button></div>` : ''}`;
  $('#dp').onchange = (e) => { S._dataPair = e.target.value; viewData(); };
  $('#dtr').onchange = (e) => { S._dataTier = e.target.value; viewData(); };
  if (!signed) return;
  $('#dl').onclick = () => {
    const blob = new Blob([JSON.stringify({ account: { riotId: P().name, tier: P().tier, region: 'EUW', verified: S.verified, ...S.signupForm }, balanceCents: S.balance, points: S.points, signups: S.signups, milestones: S.milestones, games: S.games, contests: Object.values(S.contests).filter((c) => c.entries.some((e) => e.you)) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'skybreak-my-data.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#out').onclick = () => { S.profile = null; save(); location.hash = '#/signin'; };
  $('#reset').onclick = () => { if (confirm('Reset the demo? Your simulated account, games and contests are deleted.')) { S = fresh(); save(); location.hash = '#/signin'; render(); } };
}

// ---------- router ----------
function render() {
  const h = location.hash || '#/';
  const m = h.match(/^#\/(\w+)(?:\/(.*))?/);
  const [route, arg] = m ? [m[1], m[2]] : ['', ''];
  chrome(route);
  if (route === 'signin') viewSignin();
  else if (route === 'signup') viewSignup();
  else if (route === 'home') viewHome();
  else if (route === 'history') viewHistory();
  else if (route === 'train') arg === 'new' ? viewPick('training', 0) : viewTrain();
  else if (route === 'milestones') viewMilestones();
  else if (route === 'contests') viewContests();
  else if (route === 'join') (arg ? viewPick('contest', Number(arg) || 0) : (location.hash = '#/contests'));
  else if (route === 'verify') viewVerify();
  else if (route === 'contest') viewContest(arg);
  else if (route === 'rules') viewRules();
  else if (route === 'data') viewData();
  else location.hash = S.profile == null ? '#/signin' : '#/home';
  chrome(route);
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-check]');
  if (c && S.profile != null) {
    const n = runCheck({ daily: c.dataset.check === 'daily' });
    toast(n ? `Check done: ${n} new game${n > 1 ? 's' : ''} found.` : 'Check done: no new games.');
    render();
  }
  const u = e.target.closest('[data-unlock]');
  if (u) { const s = S.signups.find((x) => x.id === u.dataset.unlock); if (s && s.status === 'waiting') { unlock(s); render(); } }
});
addEventListener('hashchange', () => { render(); scrollTo(0, 0); });
load();
render();
