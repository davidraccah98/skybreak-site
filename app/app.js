// Skybreak demo, built on docs/APP.md. Two areas of equal weight:
//  - Personal (free, basic account): Home, Intelligence, Training. A training sign-up locks a champion and role;
//    the game is judged on every challenge of the pair and enters a free training contest of 20.
//  - Contests (prizes, verified account): Lobby, Join (pair + 3 challenges), My contests, Contest, Wallet.
// The Er Zebbor demo account uses real EUW games and challenge values, with the real v2 catalog and its tier
// correction. Checks reveal the account's next real game;
// other players, the clock, the money and the improvement numbers are simulated. Kept only in this browser.
'use strict';
const D = window.SKY;
const PROFILES = window.PROFILES;
const ADJ = window.ADJUST;
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app');
const LEVELS = ['easy', 'medium', 'hard'];
const LV = { easy: 'E', medium: 'M', hard: 'H' };
const LEVEL_Q = { easy: 0.40, medium: 0.65, hard: 0.85 }; // share of games below each line (60/35/15% reach it)
const POINTS = { easy: D.levels.easy.points, medium: D.levels.medium.points, hard: D.levels.hard.points };
const TARGET = { easy: D.levels.easy.target, medium: D.levels.medium.target, hard: D.levels.hard.target };
const ROLES = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', BOTTOM: 'Bot', UTILITY: 'Support' };
const TIERS = ['GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER'];
const tierName = (t) => t[0] + t.slice(1).toLowerCase();
const CH = Object.fromEntries(D.challenges.map((c) => [c.id, c]));
const PRIZE_X = [2, 1.7, 1.5, 1.2, 1, 1, 1, 1, 1, 1, 1, 1, 0.8, 0.8, 0, 0, 0, 0, 0, 0];
const SEATS = 20;
const TICKETS = [200, 500, 1000];
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const START_BALANCE = 2000;
const PAST_SHARE = 0.7; // the account's older games are its history; the newer ones are revealed by checks
const DEMO_PROFILE = 0;
const DEMO_RIOT_ID = 'Er Zebbor#EUW';

// ---------- state ----------
const KEY = 'skybreak-demo-v7'; // v7: no milestones; games keep the real game's start (src) for the training report
let S;
function fresh(keep = {}) {
  return { profile: null, signupForm: null, verified: false, balance: 0, now: Date.now(), lastCheck: Date.now(), cursor: 0, signups: [], games: [], contests: {}, imp: {}, ledger: [], seq: 1, area: 'personal', ...keep };
}
function load() {
  try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { S = fresh(); }
  if (!S.imp) S = fresh();
  // Older demo sessions could point to one of the anonymous comparison profiles.
  // The reviewer experience now exposes only the real Er Zebbor dataset.
  if (S.profile != null && S.profile !== DEMO_PROFILE) S = fresh();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode: works until reload */ } }
const uid = (p) => `${p}${S.seq++}`;
const P = () => {
  const p = PROFILES[S.profile];
  return p && S.profile === DEMO_PROFILE ? { ...p, name: DEMO_RIOT_ID } : p;
};

let seed = (Date.now() % 2147483647) || 7;
const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());

// ---------- catalog: thresholds with the tier correction (unchanged algorithm) ----------
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
/** Value at quantile u of the pair's distribution, through the known lines. */
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
/** Position 0-100 of a value among the players of the tier with that pair (inverse of valueAt). */
function position(pair, id, value, win, tier) {
  const first = (test) => { let lo = 0.005, hi = 0.995; if (test(lo)) return lo; if (!test(hi)) return hi; for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (test(m)) hi = m; else lo = m; } return hi; };
  const a = first((u) => valueAt(pair, id, win, u, tier) >= value);
  const b = first((u) => valueAt(pair, id, win, u, tier) > value);
  return Math.max(1, Math.min(99, Math.round(((a + b) / 2) * 100)));
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
function lineText(pair, id, level, tier) {
  const v = (offersOf(pair)[id] || [])[LEVELS.indexOf(level)];
  if (v == null) return null;
  return Array.isArray(v) ? `${fmt(id, lineOf(pair, id, level, true, tier))} win · ${fmt(id, lineOf(pair, id, level, false, tier))} loss` : fmt(id, lineOf(pair, id, level, true, tier));
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
const euro = (c) => `${(c / 100).toFixed(c % 100 ? 2 : 0)} €`;
const euro2 = (c) => `${(c / 100).toFixed(2)} €`;
const when = (t) => new Date(t).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const clock = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const day = (t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const esc = (s) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const pct = (x) => `${Math.round(x * 100)}%`;
const signed = (x) => (x == null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x)}`);
const ord = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
const num = (id) => id.replace(/^\D+/, '');
const rl = (sec, text = 'Rule') => `<a class="rl" href="#/rules/${sec}">${text} ›</a>`;

// ---------- judging a game on every challenge of its pair ----------
function analyse(g) {
  const tier = P().tier;
  g.pos = {}; g.reach = {};
  let sum = 0, n = 0, above = 0;
  for (const id of Object.keys(offersOf(g.pair))) {
    const v = g.v[id];
    if (v == null) continue;
    const p = position(g.pair, id, v, g.win, tier);
    g.pos[id] = p; sum += p; n++; if (p > 50) above++;
    let lv = null;
    for (const l of LEVELS) { const line = lineOf(g.pair, id, l, g.win, tier); if (line != null && v >= line) lv = l; }
    g.reach[id] = lv;
  }
  Object.assign(g, { mean: n ? sum / n : 50, above, of: n, analysed: true });
}
/** Demo only: the improvement formula is not final (docs/APP.md). Mean position against the tier (50) and against
 *  the account's last 10 training games on the same champion, the same role and the same pair. */
function improvement(g) {
  const prior = S.games.filter((x) => x.analysed && x.kind === 'training' && x.start < g.start && x.id !== g.id);
  const { champ, role } = splitPair(g.pair);
  const base = (f) => { const l = prior.filter(f).sort((a, b) => b.start - a.start).slice(0, 10); return l.length >= 3 ? l.reduce((a, x) => a + x.mean, 0) / l.length : null; };
  const r = { tier: g.mean - 50, champ: base((x) => splitPair(x.pair).champ === champ), role: base((x) => splitPair(x.pair).role === role), pair: base((x) => x.pair === g.pair) };
  for (const k of ['champ', 'role', 'pair']) if (r[k] != null) r[k] = g.mean - r[k];
  const vals = Object.values(r).filter((v) => v != null);
  for (const k of Object.keys(r)) if (r[k] != null) r[k] = Math.round(r[k]);
  r.total = Math.round(vals.reduce((a, v) => a + v, 0) / vals.length);
  g.imp = r;
}
const analysed = () => S.games.filter((g) => g.analysed);
/** Per pair, challenge and level: games judged and games made, on the account's tier lines (for contest picks). */
let recCache = null;
function rec() {
  const k = `${S.profile}:${S.games.length}`;
  if (recCache && recCache.k === k) return recCache.r;
  const r = {}, tier = P().tier;
  for (const g of analysed()) for (const id of Object.keys(g.pos)) for (const level of LEVELS) {
    const line = lineOf(g.pair, id, level, g.win, tier);
    if (line == null) continue;
    const key = `${g.pair}#${id}#${level}`;
    const t = r[key] || (r[key] = { n: 0, hits: 0 });
    t.n++; if (g.v[id] >= line) t.hits++;
  }
  recCache = { k, r };
  return r;
}
function mains() {
  const n = {};
  for (const g of analysed()) n[g.pair] = (n[g.pair] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([pair, games]) => ({ pair, games }));
}
/** Per challenge on one pair: mean position minus 50, games, and the last 10 positions. */
function profileOf(pair) {
  const gs = analysed().filter((g) => g.pair === pair).sort((a, b) => a.start - b.start);
  return Object.keys(offersOf(pair)).map((id) => {
    const ps = gs.filter((g) => g.pos[id] != null).map((g) => g.pos[id]);
    return { id, n: ps.length, delta: ps.length ? Math.round(ps.reduce((a, x) => a + x, 0) / ps.length - 50) : null, last: ps.slice(-10) };
  }).filter((e) => e.n > 0).sort((a, b) => b.delta - a.delta);
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

// ---------- money ----------
function money(kind, amount, contestId, at = S.now) {
  S.balance += amount;
  S.ledger.push({ at, kind, amount, contestId: contestId || null });
}

// ---------- simulated other players and contests ----------
const NAMES = ['Nightglass', 'Kaeru', 'Velmora', 'Tidecaller', 'Ashfang', 'Orrin', 'Sablewing', 'Quietstorm', 'Brisa', 'Halcyon', 'Mirelle', 'Jotun', 'Pyrelight', 'Zephra', 'Tamsin', 'Coldiron', 'Wren', 'Saffi', 'Ondine', 'Brokenhalo', 'Grimsby', 'Kestrel', 'Novaline', 'Thistle', 'Umbral', 'Vesper', 'Yarrow', 'Fenwick', 'Morrow', 'Quill'];
const botName = () => `${pick(NAMES)}#${String(Math.floor(rnd() * 900) + 100)}`;
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
  return { name: botName(), tier, pair, at, win, results, total: Math.round(results.reduce((a, r) => a + r.points, 0) * 10) / 10, you: false };
}
const impBot = (at) => ({ name: botName(), tier: pick(TIERS), pair: pick(pairKeys), at, total: Math.round(gauss() * 6 + 1), you: false });
function newContest(kind, ticket, at) {
  const id = uid(kind === 'imp' ? 'I' : 'C');
  const c = { id, kind, ticket, createdAt: at, state: 'open', entries: [] };
  (kind === 'imp' ? S.imp : S.contests)[id] = c;
  return c;
}
const allContests = () => [...Object.values(S.contests), ...Object.values(S.imp)];
const findContest = (id) => S.contests[id] || S.imp[id];
/** Places with ties: tied players share the place (and, in prize contests, the prizes of the places they hold). */
function ranked(c) {
  const rows = [...c.entries].sort((a, b) => b.total - a.total || a.at - b.at);
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1].total === rows[i].total) j++;
    const sum = c.ticket ? PRIZE_X.slice(i, j + 1).reduce((a, x) => a + x * c.ticket, 0) : 0;
    for (let k = i; k <= j; k++) { rows[k]._place = i + 1; rows[k]._tie = j > i; rows[k]._prize = Math.round(sum / (j - i + 1)); }
    i = j + 1;
  }
  return rows;
}
function settle(c, quiet) {
  const rows = ranked(c);
  for (const e of rows) { e.place = e._place; e.prize = e._prize; }
  Object.assign(c, { entries: rows, state: 'done', pool: c.ticket * SEATS * 0.8, closedAt: S.now });
  const me = rows.find((e) => e.you);
  if (!me) return;
  if (me.prize) money('prize', me.prize, c.id);
  if (!quiet) toast(c.kind === 'imp' ? `Training contest #${num(c.id)} finished: you placed ${ord(me.place)}.` : `Contest #${num(c.id)} finished: ${ord(me.place)}${me.prize ? `, ${euro2(me.prize)} credited to your wallet` : ''}.`);
}
function addEntry(c, e, quiet) { c.entries.push(e); if (c.entries.length >= SEATS) settle(c, quiet); }
function botsArrive(hours) {
  for (const c of allContests()) {
    if (c.state !== 'open') continue;
    const n = Math.min(SEATS - c.entries.length, Math.floor(rnd() * 2 + hours * (0.25 + rnd() * 0.4)));
    for (let i = 0; i < n && c.state === 'open'; i++) addEntry(c, c.kind === 'imp' ? impBot(S.now - rnd() * hours * HOUR) : botEntry(S.now - rnd() * hours * HOUR));
  }
  for (const t of TICKETS) if (!Object.values(S.contests).some((c) => c.ticket === t && c.state === 'open')) newContest('prize', t, S.now);
  if (!Object.values(S.imp).some((c) => c.state === 'open')) newContest('imp', 0, S.now);
}
/** The open contest of that kind and ticket where the player is not yet, the fullest first; or a new one. */
function enter(kind, ticket, at) {
  const pool = Object.values(kind === 'imp' ? S.imp : S.contests);
  const c = pool.filter((x) => x.state === 'open' && x.ticket === ticket && !x.entries.some((e) => e.you)).sort((a, b) => b.entries.length - a.entries.length)[0];
  return c ? { c, opened: false } : { c: newContest(kind, ticket, at), opened: true };
}

// ---------- signing in: the account's history and a few past contests ----------
function signIn(i) {
  S = fresh({ signupForm: S.signupForm });
  S.profile = i;
  const all = PROFILES[i].games;
  const past = Math.floor(all.length * PAST_SHARE);
  const shift = S.now - DAY - all[past - 1].start; // real results; dates moved so the last game was yesterday
  money('deposit', START_BALANCE, null, S.now - 3 * DAY);
  for (let k = 0; k < past; k++) {
    const r = all[k];
    const g = { id: `H${k}`, pair: r.pair, win: r.win, minutes: r.minutes, v: r.v, start: r.start + shift, src: r.start, kind: 'training', note: 'Training game (demo history).', signup: null };
    analyse(g); S.games.push(g); improvement(g);
  }
  const hist = S.games;
  // two finished improvement contests and one open, with the account's training games
  for (const [k, done] of [[past - 16, true], [past - 9, true], [past - 1, false]]) {
    const g = hist[k];
    if (!g) continue;
    const c = newContest('imp', 0, g.start - 6 * HOUR);
    const n = done ? SEATS - 1 : 11;
    for (let b = 0; b < n; b++) addEntry(c, impBot(c.createdAt + b * 25 * 60e3), true);
    addEntry(c, { name: P().name, tier: P().tier, pair: g.pair, at: g.start, total: g.imp.total, you: true }, true);
    g.contestId = c.id;
    g.note = `Training game: entered training contest #${num(c.id)}.`;
  }
  // one finished 2 € contest with one of the account's games
  const cg = hist[past - 5];
  if (cg) {
    cg.kind = 'contest';
    // demo: the 3 challenges this player would have locked are the ones they are strongest at on this pair
    cg.picks = Object.keys(cg.pos).sort((a, b) => cg.pos[b] - cg.pos[a]).slice(0, 3)
      .map((id) => ({ id, level: cg.reach[id] || LEVELS.find((l, i) => offersOf(cg.pair)[id][i] != null) }));
    cg.results = cg.picks.map((p) => { const value = cg.v[p.id] ?? valueAt(cg.pair, p.id, cg.win, 0.5, P().tier); return { ...p, value, ...score(cg.pair, p, value, cg.win, P().tier) }; });
    cg.total = Math.round(cg.results.reduce((a, r) => a + r.points, 0) * 10) / 10;
    const c = newContest('prize', 200, cg.start - 5 * HOUR);
    for (let b = 0; b < SEATS - 1; b++) c.entries.push(botEntry(c.createdAt + b * 20 * 60e3));
    money('ticket', -200, c.id, cg.start);
    S.now = cg.start + 4 * HOUR;
    addEntry(c, { name: P().name, tier: P().tier, pair: cg.pair, at: cg.start, win: cg.win, results: cg.results, total: cg.total, you: true }, true);
    S.now = Date.now();
    cg.contestId = c.id;
    cg.note = `Contest game: entered 2 € contest #${num(c.id)}.`;
  }
  // the other contests running now
  for (const t of TICKETS) for (let k = 0; k < 2; k++) {
    const c = newContest('prize', t, S.now - (k + 1) * 5 * HOUR);
    const n = k === 0 ? 8 + Math.floor(rnd() * 9) : SEATS;
    for (let b = 0; b < n; b++) addEntry(c, botEntry(c.createdAt + b * 20 * 60e3), true);
  }
  S.cursor = past;
  save();
  location.hash = '#/home';
}

// ---------- the check (same rules for training and contests) ----------
function nextRealGame() {
  const all = P().games;
  const g = S.cursor < all.length ? all[S.cursor++] : pick(all.slice(0, Math.floor(all.length * PAST_SHARE)));
  return { pair: g.pair, win: g.win, minutes: g.minutes, v: g.v, src: g.start };
}
const active = (s) => s.status === 'waiting' || s.status === 'unlocking';
function runCheck({ endOfDay = false, short = false } = {}) {
  const from = S.lastCheck;
  const elapsed = endOfDay ? 10 * HOUR : short ? (5 + rnd() * 25) * 60e3 : (2 + rnd() * 4) * HOUR;
  S.now += elapsed;
  const to = S.now;
  const n = short ? (rnd() < 0.3 ? 1 : 0) : endOfDay ? 1 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2);
  const found = [];
  const span = (to - from) * 0.8; // games start in the window since the last check and end before this one
  for (let k = 0; k < n; k++) found.push({ ...nextRealGame(), start: from + ((k + 0.3 + rnd() * 0.5) / n) * span });
  const tier = P().tier;
  for (const f of found) {
    const g = { id: uid('G'), ...f, note: '', signup: null, checked: to, kind: 'none' };
    const s = S.signups.filter((x) => active(x) && x.pair === f.pair && x.at < f.start && (x.status !== 'unlocking' || f.start < x.unlockAsked)).sort((a, b) => a.at - b.at)[0];
    if (!s) {
      const sameChamp = S.signups.some((x) => active(x) && splitPair(x.pair).champ === splitPair(f.pair).champ);
      g.note = sameChamp ? 'Same champion, different role: champion and role must match exactly. Your sign-up keeps waiting.' : 'Not signed up: not analysed.';
      g.v = null; g.analysed = false;
      S.games.push(g);
      continue;
    }
    s.status = 'played'; s.gameId = g.id; g.signup = s.id;
    analyse(g);
    if (s.kind === 'training') {
      g.kind = 'training';
      S.games.push(g);
      improvement(g);
      const { c, opened } = enter('imp', 0, f.start);
      s.contestId = c.id; g.contestId = c.id;
      g.note = `Judged on all ${g.of} challenges of ${pairLabel(g.pair)}. ${opened ? 'Opened' : 'Entered'} training contest #${num(c.id)}.`;
      addEntry(c, { name: P().name, tier, pair: f.pair, at: f.start, total: g.imp.total, you: true });
    } else {
      g.kind = 'contest';
      g.picks = s.picks;
      g.results = s.picks.map((p) => { const value = f.v[p.id] ?? valueAt(f.pair, p.id, f.win, 0.5, tier); return { ...p, value, ...score(f.pair, p, value, f.win, tier) }; });
      g.total = Math.round(g.results.reduce((a, r) => a + r.points, 0) * 10) / 10;
      S.games.push(g);
      const { c, opened } = enter('prize', s.ticket, f.start);
      money('ticket', -s.ticket, c.id, f.start);
      s.contestId = c.id; g.contestId = c.id;
      g.note = `${opened ? 'Opened' : 'Entered'} ${euro(s.ticket)} contest #${num(c.id)}: ticket taken from your balance.`;
      addEntry(c, { name: P().name, tier, pair: f.pair, at: f.start, win: f.win, results: g.results, total: g.total, you: true });
      for (const o of S.signups) if (active(o) && o.kind === 'contest' && o.ticket > S.balance) { o.status = 'removed'; o.note = 'Removed: your balance no longer covers this ticket. Nothing was charged.'; }
    }
  }
  for (const s of S.signups) if (s.status === 'unlocking' && S.now >= s.unlockAt) { s.status = 'unlocked'; s.note = 'Unlocked: no valid game started before your request.'; }
  if (endOfDay) for (const s of S.signups) if (s.status === 'waiting') { s.status = 'removed'; s.note = 'Removed at the end of the day: not played. Nothing was charged.'; }
  botsArrive(elapsed / HOUR);
  S.lastCheck = to;
  save();
  return found.length;
}
function unlock(s) {
  const n = runCheck({ short: true });
  if (s.status === 'played') { toast(`The check found your game${n > 1 ? 's' : ''}: it entered the contest, so the unlock does not apply.`); return; }
  if (rnd() < 0.15) { s.note = 'Unlock refused: you were in a game at that moment. Try again when it ends.'; save(); toast('You are in a game right now: unlock refused.'); return; }
  Object.assign(s, { status: 'unlocking', unlockAsked: S.now, unlockAt: S.now + HOUR, note: `Unlock requested at ${clock(S.now)}: it takes effect at ${clock(S.now + HOUR)} if no valid game started before the request.` });
  save(); toast('Unlock requested: it takes effect in 1 hour.');
}

// ---------- UI pieces ----------
let toastTimer;
function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 4600);
}
const PERSONAL = ['home', 'intel', 'train'];
const CONTEST = ['contests', 'join', 'mine', 'contest', 'wallet', 'verify'];
const PUBLIC = ['signin', 'signup', 'link'];
function areaOf(route) {
  if (S.profile == null) return 'public';
  if (PERSONAL.includes(route)) return 'personal';
  if (CONTEST.includes(route)) return 'contest';
  return S.area || 'personal';
}
function chrome(route) {
  const h = location.hash || '#/';
  const a = areaOf(route);
  if (a !== 'public') S.area = a;
  document.body.dataset.area = a;
  const icon = (name) => {
    const paths = {
      home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6"/>',
      intel: '<path d="M5 19V11M12 19V5M19 19v-8"/><path d="M3 19h18"/>',
      train: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="m15 9 5-5M16.5 4H20v3.5"/>',
      contests: '<path d="M8 4h8v4c0 3-1.8 5-4 5S8 11 8 8V4Z"/><path d="M8 6H4v2c0 2 1.5 3.5 4 3.5M16 6h4v2c0 2-1.5 3.5-4 3.5M12 13v4M8 20h8M9 17h6"/>',
      rules: '<path d="M4 5.5C7 4.5 9.5 5 12 7v13c-2.5-2-5-2.5-8-1.5v-13ZM20 5.5c-3-1-5.5-.5-8 1.5v13c2.5-2 5-2.5 8-1.5v-13Z"/>'
    };
    return `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || ''}</svg>`;
  };
  const navActive = (key, href) => key === 'contests'
    ? CONTEST.includes(route)
    : key ? route === key : h === href || h.startsWith(`${href}/`);
  const link = ([href, name, key]) => `<a href="${href}" class="${navActive(key, href) ? 'on' : ''}">${key ? icon(key) : ''}<span>${name}</span></a>`;
  let html;
  if (a === 'public') {
    html = `<a class="logo" href="#/signin"><i></i>Skybreak</a><nav class="areanav pub">${[['#/rules', 'Rules']].map(link).join('')}</nav>
    <div class="right"><a class="btn small" href="#/signin">Sign in</a></div>`;
  } else {
    const nav = [['#/home', 'Home', 'home'], ['#/intel', 'Intelligence', 'intel'], ['#/train', 'Training', 'train'], ['#/contests', 'Contests', 'contests'], ['#/rules', 'Rules', 'rules']];
    const ini = P().name[0];
    html = `<a class="logo" href="#/home"><i></i>Skybreak</a>
    <nav class="areanav" aria-label="Main navigation">${nav.map(link).join('')}</nav>
    <div class="right"><button class="btn small" data-check="manual" title="Look for your new games now">Check<span class="hide-s"> my games</span></button>
    ${a === 'contest' ? `<a class="pill" href="#/wallet" title="Your balance">${euro2(S.balance)}</a>` : ''}
    <details class="me"><summary aria-label="Account menu"><span class="av">${esc(ini)}</span><span class="account-brief"><b>${esc(P().name.split('#')[0])}</b><small>${tierName(P().tier)} · EUW</small></span></summary><div class="menu"><div class="who"><b>${esc(P().name)}</b><span>${tierName(P().tier)} · EUW · ${S.verified ? 'Verified' : 'Base'}</span></div>
    <a href="#/account">Account</a><a href="#/rules">Rules</a><a href="#/support">Support</a><button type="button" data-signout>Sign out</button></div></details></div>`;
  }
  $('#top').innerHTML = `<div class="top-in">${html}</div>`;
  $('#games-n').textContent = D.facts.games.toLocaleString('en-GB');
}
function needAccount() {
  if (S.profile != null) return false;
  location.hash = '#/signin';
  return true;
}
const statusTag = (s) => ({ waiting: '<span class="tag wait">waiting for your game</span>', unlocking: `<span class="tag wait">unlocking until ${clock(s.unlockAt)}</span>`, played: '<span class="tag ok">played</span>', removed: '<span class="tag no">removed</span>', unlocked: '<span class="tag">unlocked</span>' }[s.status]);
const picksHtml = (picks) => picks.map((p) => `<span class="tag ${p.level}">${CH[p.id].name} ${LV[p.level]}</span>`).join(' ');
function signupRow(s) {
  const what = s.kind === 'training' ? 'Training · all challenges' : `${euro(s.ticket)} contest · ${picksHtml(s.picks)}`;
  const act = s.status === 'waiting' ? `<button class="btn ghost small" data-unlock="${s.id}">Unlock</button>` : s.contestId ? `<a class="btn ghost small" href="${s.kind === 'training' ? `#/train/contest/${s.contestId}` : `#/contest/${s.contestId}`}">Contest #${num(s.contestId)}</a>` : '';
  return `<div class="item"><div class="row nowrap">${icon(splitPair(s.pair).champ)}<div class="grow"><b>${pairLabel(s.pair)}</b><div class="small muted">${what} · locked ${clock(s.at)}</div></div>${act}</div>
  <div class="row between" style="margin-top:6px">${statusTag(s)}${s.note ? `<span class="small muted grow" style="text-align:right">${esc(s.note)}</span>` : ''}</div></div>`;
}
function checkBar() {
  return `<div class="checkbar"><div class="small muted">Last check ${when(S.lastCheck)}. At the end of the day the daily check runs and removes sign-ups not played. ${rl('signups')}</div>
  <div class="row"><button class="btn" data-check="manual">Check my games</button><button class="btn ghost" data-check="day">Skip to the end of the day</button></div></div>`;
}
function tabs(items, on) { return `<div class="tabs" role="tablist">${items.map(([href, name, k]) => `<a role="tab" href="${href}" class="${k === on ? 'on' : ''}" aria-selected="${k === on}">${name}</a>`).join('')}</div>`; }
function spark(values) {
  if (values.length < 2) return '';
  const w = 64, h = 20, step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / 100) * h).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><line x1="0" x2="${w}" y1="${h / 2}" y2="${h / 2}" class="mid"/><polyline points="${pts}"/></svg>`;
}
function divergingChart(list) {
  if (!list.length) return '<p class="muted">Not enough games yet.</p>';
  const max = Math.max(20, ...list.map((e) => Math.abs(e.delta)));
  return `<div class="dchart" role="table" aria-label="Your position against your tier, per challenge"><div class="drow head" role="row"><span role="columnheader"></span><span role="columnheader" class="dscale"><span>below your tier</span><span>above your tier</span></span><span role="columnheader" class="dval">vs tier</span><span role="columnheader" class="dsp hide-s">last 10</span></div>
  ${list.map((e) => { const w = (Math.abs(e.delta) / max) * 50; return `<div class="drow ${e.n < 5 ? 'few' : ''}" role="row" title="${CH[e.id].name}: average position ${50 + e.delta}/100 over ${e.n} games"><span class="dlab" role="cell">${CH[e.id].name}</span>
    <span class="dtrack" role="cell"><i class="${e.delta >= 0 ? 'up' : 'down'}" style="${e.delta >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`}"></i></span>
    <span class="dval" role="cell"><b>${signed(e.delta)}</b> <span class="muted small">${e.n < 5 ? 'few data' : `${e.n} games`}</span></span><span class="dsp hide-s" role="cell">${spark(e.last)}</span></div>`; }).join('')}</div>`;
}
let openPicker = null;
/** Pair picker: the account's pairs, a champion carousel and the roles. Used by training and by Join. */
function pairPicker(draft) {
  const ms = mains();
  const champs = [...new Set([...ms.map((m) => splitPair(m.pair).champ), ...pairKeys.map((k) => splitPair(k).champ).sort((a, b) => champName(a).localeCompare(champName(b)))])];
  const ci = champs.indexOf(draft.champ);
  const rolesOf = (c) => Object.keys(ROLES).filter((r) => D.pairs[`${r}|${c}`]);
  const html = `<div class="chips mine">${ms.slice(0, 4).map((m) => `<button class="chip ${m.pair === draft.pair ? 'on' : ''}" data-mypair="${m.pair}">${pairLabel(m.pair)} <span class="muted">${m.games}</span></button>`).join('')}</div>
  <div class="carousel" aria-label="Champions"><button class="cnav" data-cstep="-1" aria-label="Previous champion">‹</button><div class="ctrack" id="ctrack">${champs.map((c, i) => `<button class="citem ${i === ci ? 'on' : ''}" data-champ="${c}" style="--d:${Math.min(3, Math.abs(i - ci))}" aria-pressed="${i === ci}">${icon(c)}<span>${champName(c)}</span></button>`).join('')}</div><button class="cnav" data-cstep="1" aria-label="Next champion">›</button></div>
  <div class="row center">${rolesOf(draft.champ).map((ro) => `<button class="chip ${draft.pair === `${ro}|${draft.champ}` ? 'on' : ''}" data-role="${ro}">${ROLES[ro]}</button>`).join('')}</div>
  <p class="small muted center" style="margin-top:6px">${(ms.find((m) => m.pair === draft.pair) || { games: 0 }).games} of your signed-up games with ${pairLabel(draft.pair)}</p>`;
  const bind = (rerender) => {
    const tr = $('#ctrack'), on = tr && tr.querySelector('.citem.on');
    if (on) tr.scrollLeft = on.offsetLeft - tr.clientWidth / 2 + on.clientWidth / 2;
    const keep = () => { const y = scrollY; rerender(); scrollTo(0, y); };
    const setChamp = (c) => { const mine = ms.find((m) => splitPair(m.pair).champ === c); draft.champ = c; draft.pair = mine ? mine.pair : `${rolesOf(c)[0]}|${c}`; draft.picks = []; keep(); };
    app.querySelectorAll('[data-champ]').forEach((b) => (b.onclick = () => setChamp(b.dataset.champ)));
    app.querySelectorAll('[data-cstep]').forEach((b) => (b.onclick = () => setChamp(champs[(ci + Number(b.dataset.cstep) + champs.length) % champs.length])));
    app.querySelectorAll('[data-role]').forEach((b) => (b.onclick = () => { draft.pair = `${b.dataset.role}|${draft.champ}`; draft.picks = []; keep(); }));
    app.querySelectorAll('[data-mypair]').forEach((b) => (b.onclick = () => { draft.pair = b.dataset.mypair; draft.champ = splitPair(draft.pair).champ; draft.picks = []; keep(); }));
  };
  return { html, bind };
}
function newDraft(kind, ticket) {
  const first = (mains()[0] || { pair: 'MIDDLE|Ahri' }).pair;
  return { kind, ticket, champ: splitPair(first).champ, pair: first, picks: [] };
}

// ---------- public: sign in, create account, link Riot ----------
const AREAS = [
  ['#/home', 'Home', 'area-home.jpg', 'How much you improved lately, your mains, and your training match history.'],
  ['#/intel', 'Intelligence', 'area-intel.jpg', 'All your ranked solo games, your mains against your tier, and every champion\'s numbers by role and tier.'],
  ['#/train', 'Training', 'area-train.jpg', 'Where you see what is wrong in your own game: the champions you can improve, the lane phase and build of every game, and how you changed. Signed-up games enter free training contests.'],
  ['#/contests', 'Contests', 'area-contests.jpg', 'Prize contests on your own ranked games: 20 players, each measured against the average player of their tier on that champion and role. We don\'t create custom games, so we don\'t use the Tournament API.'],
  ['#/rules', 'Rules', 'area-rules.jpg', 'One page, linked from every screen: accounts, scoring, sign-ups, prizes, fair play and how we treat the data.'],
];
/** Enter the demo as Er Zebbor on one screen (keeps the demo state if already in). */
function enterDemo(to) {
  if (S.profile == null) signIn(DEMO_PROFILE);
  location.hash = to;
}
function viewSignin() {
  const back = PRIZE_ROWS.filter(([, x]) => x).map(([n, x]) => `<span><b>${n}</b> ${x === 1 ? 'ticket back' : `×${x}`}</span>`).join('');
  app.innerHTML = `<div class="entry"><div class="entry-head"><p class="eyebrow">Skybreak demo</p><h1>Built with respect for the game</h1>
  <p class="entry-note">I've played League since I was 15, and Skybreak is built out of respect for that game. We followed Riot's developer policies from the first design; if anything here doesn't fit, tell us and we'll change it. <span class="muted">— the founder</span></p>
  <div class="row"><button class="btn" data-enter="#/home">${S.profile == null ? 'Start as Er Zebbor' : 'Continue as Er Zebbor'}</button><span class="small muted">Er Zebbor's EUW games and the thresholds are real; other players, time and money are simulated.</span></div></div>
  <h2>The areas</h2><div class="areas">${AREAS.map(([k, name, img, text]) => `<article class="area"><button class="shot" data-enter="${k}" aria-label="Open ${name}"><img src="assets/${img}" alt="${name} screen" loading="lazy"></button>
  <div class="area-text"><h3>${name}</h3><p class="small">${text}</p>${k === '#/contests' ? `<div class="back">${back}</div>` : ''}<button class="more" data-enter="${k}">Open ${name} ›</button></div></article>`).join('')}</div>
  <h2>How we treat the data</h2><div class="card entry-data">${dataList()}
  <p class="small"><b>What we read from Riot:</b> after Riot Sign On, the Riot ID, region, rank tier and ranked solo games, through the official API. Never the password, nothing during the game.</p>
  <p class="small muted">${dataProof()} <a href="#/rules/method">In the rules ›</a></p></div>
  <p class="small muted">Questions: <a href="mailto:david@skybreak.gg">david@skybreak.gg</a></p></div>`;
  app.querySelectorAll('[data-enter]').forEach((b) => (b.onclick = () => enterDemo(b.dataset.enter)));
}
function viewSignup() {
  const f = S.signupForm || {};
  app.innerHTML = `<div class="narrow"><p class="eyebrow">Step 1 of 2</p><h1>Create your account</h1><p class="sub">A base account opens the whole personal area: Intelligence, Training and training contests. Prize contests need a verified account, asked later. ${rl('accounts')}</p>
  <form class="card form" id="su" novalidate>
    <div><label class="fld" for="em">Email</label><input type="email" id="em" autocomplete="email" value="${esc(f.email || '')}"></div>
    <div><label class="fld" for="pw">Password</label><input type="password" id="pw" autocomplete="new-password"></div>
    <div class="row"><div><label class="fld" for="co">Country</label><select id="co">${['Italy', 'France', 'Germany', 'Spain', 'United Kingdom', 'Other EU'].map((c) => `<option>${c}</option>`).join('')}</select></div>
    <div><label class="fld" for="la">Language</label><select id="la"><option>English</option><option>Italiano</option></select></div></div>
    <label class="check"><input type="checkbox" id="tos"> I accept the <a href="#/rules">rules</a> (v1) and the privacy terms.</label>
    <label class="check"><input type="checkbox" id="mk"> Send me news about Skybreak (optional).</label>
    <div class="row"><button class="btn" type="submit">Create account</button><a class="btn ghost" href="#/link">Skip (demo)</a></div>
  </form></div>`;
  $('#su').onsubmit = (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test($('#em').value)) { toast('Type a valid email.'); return; }
    if ($('#pw').value.length < 8) { toast('The password needs at least 8 characters.'); return; }
    if (!$('#tos').checked) { toast('Accept the rules to continue.'); return; }
    S.signupForm = { email: $('#em').value, country: $('#co').value, language: $('#la').value, marketing: $('#mk').checked };
    save(); location.hash = '#/link';
  };
}
function viewLink() {
  app.innerHTML = `<div class="narrow"><p class="eyebrow">Step 2 of 2</p><h1>Link your Riot account</h1>
  <div class="card"><p>We read your <b>Riot ID, region, rank tier and your ranked solo games</b>, through Riot's official API. Never your password, nothing during the game.</p>
  <p class="note">Your Riot account can never be changed later: one person, one Riot account.</p>
  <div class="row"><a class="btn" href="#/signin">Sign in with Riot</a><span class="small muted">Demo: continue with Er Zebbor's linked account.</span></div></div></div>`;
}

// ---------- personal area ----------
function viewHome() {
  if (needAccount()) return;
  const p = P();
  const ms = mains();
  const history = analysed().sort((a, b) => b.start - a.start);
  const recent = history.slice(0, 8);
  const form = history.slice(0, 10).reverse();
  const wins = form.filter((g) => g.win).length;
  const losses = form.length - wins;
  const impOpen = Object.values(S.imp).find((c) => c.state === 'open' && c.entries.some((e) => e.you));
  const lastTrain = analysed().filter((g) => g.kind === 'training').sort((a, b) => b.start - a.start)[0];
  const waitingC = S.signups.filter((s) => s.kind === 'contest' && active(s));
  const waitingT = S.signups.filter((s) => s.kind === 'training' && active(s));
  const prog = Object.values(S.contests).filter((c) => c.state === 'open' && c.entries.some((e) => e.you));
  const placeIn = (c) => ranked(c).find((e) => e.you)._place;
  const lastC = Object.values(S.contests).filter((c) => c.state === 'done' && c.entries.some((e) => e.you)).sort((a, b) => b.closedAt - a.closedAt)[0];
  const lastDone = lastC && { c: lastC, me: lastC.entries.find((e) => e.you) };
  const hist = rankedHistory();
  const hm = historyMains(hist).filter((m) => m.games.length >= 10).slice(0, 3);
  const lead = hm[0] ? { pair: hm[0].pair, games: hm[0].games.length } : ms[0];
  const imp = recentImprovement(hist);
  app.innerHTML = `<section class="player-sky"><div class="player-id"><div class="player-avatar">${lead ? icon(splitPair(lead.pair).champ, '') : esc(p.name[0])}</div><div><p class="eyebrow">Your Skybreak profile</p><h1>${esc(p.name)}</h1><p class="player-meta">EUW · ${tierName(p.tier)} rank tier · ${p.role} main</p></div></div>
  <div class="player-rank"><span>Current rank tier</span><strong>${tierName(p.tier)}</strong><small>${lead ? `${pairLabel(lead.pair)} · ${lead.games} ${hm[0] ? 'ranked' : 'signed-up'} games` : 'No games yet'}</small></div><div class="sky-fracture" aria-hidden="true"></div></section>
  ${imp ? `<section class="improve"><header class="panel-head"><div><p class="eyebrow">Your last ${imp.games} ranked games · since ${day(imp.from)}</p><h2>How much you improved lately</h2></div><a class="btn" href="#/train">Sign up your next game</a></header>
  <div class="improve-grid"><div class="improve-big ${imp.value == null ? '' : imp.value >= 0 ? 'up' : 'down'}"><strong>${imp.value == null ? '—' : pts(imp.value)}</strong><span>points of position</span>
  <p class="small">${imp.value == null ? 'Not enough earlier games on the same champions to compare yet.' : `Each of your last ${imp.games} games against your own earlier games with the same champion and role, on every challenge, as a position among ${tierName(p.tier)} players (0-100).${imp.compared < imp.games ? ` ${imp.games - imp.compared} had no earlier games to compare with.` : ''}`}</p>
  <p class="small muted">Now at <b>${Math.round(imp.pos)}</b> on average; 50 is the average ${tierName(p.tier)} player. Demo measure: the final improvement formula is still open. <a href="#/intel">Intelligence →</a></p></div>
  <div class="main-cards home-mains">${hm.map((m) => { const t = totals(m.games), tr = mainTrend(m.games); return `<a class="mcard" href="#/intel">${icon(splitPair(m.pair).champ)}<span class="mname"><b>${pairLabel(m.pair)}</b><small>${m.games.length} ranked games · ${pct(t.win)} won</small></span>
  <span class="mstat"><small>Position, last 10</small><b>${tr.pos == null ? '—' : Math.round(tr.pos)}</b>${tr.change != null ? `<em class="${tr.change >= 0 ? 'up' : 'down'}">${pts(tr.change)} vs before</em>` : ''}</span>
  <span class="mstat"><small>Rising most</small><b class="sm">${tr.best ? CH[tr.best.id].name : '—'}</b>${tr.best ? `<em class="${tr.best.d >= 0 ? 'up' : 'down'}">${pts(tr.best.d)}</em>` : ''}</span></a>`; }).join('')}</div></div></section>` : `<section class="current-form"><header><div><p class="eyebrow">Get started</p><h2>Your first signed-up game</h2></div><a class="btn" href="#/train">Sign up your next game</a></header></section>`}
  <section class="home-panel match-history"><header class="panel-head"><div><p class="eyebrow">Training</p><h2>Training match history</h2></div><a href="#/train">All training games →</a></header><p class="small muted" style="margin-top:-8px">Only the games you signed up for, in Training or in a contest. All your ranked games are in <a href="#/intel">Intelligence</a>.</p><div class="match-head"><span>Match</span><span>Result</span><span>Duration</span><span>Challenge performance</span><span></span></div>
  <div class="match-list">${recent.length ? recent.map((g) => `<a class="match-row" href="#/train/game/${g.id}">${icon(splitPair(g.pair).champ)}<span class="match-pair"><b>${pairLabel(g.pair)}</b><small>${day(g.start)} · ${g.kind === 'training' ? 'Training' : g.kind === 'contest' ? 'Contest' : 'Game'}</small></span><span class="match-result ${g.win ? 'win' : 'loss'}">${g.win ? 'Win' : 'Loss'}</span><span>${Math.round(g.minutes)} min</span><span class="match-performance"><b>${g.above}/${g.of}</b><small>above tier</small><i><em style="width:${g.of ? (g.above / g.of) * 100 : 0}%"></em></i></span><span class="match-open">View report →</span></a>`).join('') : '<p class="muted">No analysed games yet.</p>'}</div></section>
  <section class="home-insights solo"><div class="home-panel"><header class="panel-head"><div><p class="eyebrow">Training</p><h2>Progress</h2></div><a href="#/train">Training →</a></header>${impOpen ? `<a class="training-signal" href="#/train/contest/${impOpen.id}"><span>Training contest #${num(impOpen.id)}</span><strong>${ord(placeIn(impOpen))}</strong><small>${impOpen.entries.length}/${SEATS} games</small></a>` : '<p class="muted">Your next training game opens or joins a training contest.</p>'}</div></section>
  <section class="home-panel home-contests"><header class="panel-head"><div><p class="eyebrow">Contests</p><h2>Your competitive status</h2></div><a href="#/contests">Open contests →</a></header><div class="contest-status"><div><span>Wallet</span><strong>${euro2(S.balance)}</strong></div><div><span>Waiting</span><strong>${waitingC.length}</strong></div><div><span>In progress</span><strong>${prog.length}</strong></div>${lastDone ? `<a href="#/contest/${lastDone.c.id}"><span>Last result</span><strong>${ord(lastDone.me.place)}</strong><small>${lastDone.me.prize ? `Won ${euro2(lastDone.me.prize)}` : 'No prize'}</small></a>` : ''}</div></section>`;
}

// ---------- the account's whole ranked history, and everyone's numbers ----------
// Intelligence reads every ranked solo game Riot keeps for the account (app/history.js), not only the signed-up
// ones; Training and contests still judge only signed-up games. Everyone's numbers (app/champions.js) load the
// first time Intelligence opens.
const statsTier = (t) => (['GRANDMASTER', 'CHALLENGER'].includes(t) ? 'MASTER' : t);
const monthYear = (t) => new Date(t).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const dayYear = (t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const avg = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const gameKda = (g) => (g.k + g.a) / Math.max(1, g.d);
let histCache = null;
/** Every ranked game of the account, judged against its tier on the challenges offered to its champion and role. */
function rankedHistory() {
  const p = P();
  const src = p && p.real && window.HISTORY ? window.HISTORY.games : [];
  const k = `${S.profile}:${p ? p.tier : ''}:${src.length}`;
  if (histCache && histCache.k === k) return histCache.list;
  const tier = p.tier;
  const list = src.map((g) => {
    const pair = `${g.role}|${g.champ}`;
    const pos = {};
    let sum = 0, n = 0, above = 0;
    for (const id of Object.keys(offersOf(pair))) {
      const v = g.v[id];
      if (v == null) continue;
      const x = position(pair, id, v, g.win, tier);
      pos[id] = x; sum += x; n++; if (x > 50) above++;
    }
    return { ...g, pair, pos, mean: n ? sum / n : null, above, of: n };
  }).sort((a, b) => a.start - b.start);
  histCache = { k, list };
  return list;
}
/** The account's champions and roles, most played first. */
function historyMains(list = rankedHistory()) {
  const by = new Map();
  for (const g of list) by.set(g.pair, [...(by.get(g.pair) || []), g]);
  return [...by].map(([pair, games]) => ({ pair, games })).sort((a, b) => b.games.length - a.games.length);
}
function totals(list) {
  if (!list.length) return null;
  const s = (f) => list.reduce((a, g) => a + f(g), 0);
  const min = s((g) => g.minutes);
  const judged = list.filter((g) => g.mean != null);
  return { n: list.length, win: s((g) => +g.win) / list.length, kda: median(list.map(gameKda)), d: s((g) => g.d) / list.length, kp: s((g) => g.kp) / list.length,
    dpm: s((g) => g.dmg) / min, gpm: s((g) => g.gold) / min, cspm: s((g) => g.cs) / min, vpm: s((g) => g.vis) / min, minutes: min / list.length,
    pos: judged.length ? avg(judged.map((g) => g.mean)) : null, judged: judged.length };
}
/** Per challenge on one champion and role: mean position minus 50, games, and the last 10 positions. */
function historyProfile(games) {
  const ids = [...new Set(games.flatMap((g) => Object.keys(g.pos)))];
  return ids.map((id) => {
    const ps = games.filter((g) => g.pos[id] != null).map((g) => g.pos[id]);
    return { id, n: ps.length, delta: Math.round(avg(ps) - 50), last: ps.slice(-10) };
  }).filter((e) => e.n > 0).sort((a, b) => b.delta - a.delta);
}
/** Demo measure of recent improvement (the final formula is still open, docs/APP.md): each of the last 20 judged
 *  games against the account's own earlier games with the same champion and role, in points of position (0-100). */
function recentImprovement(list = rankedHistory()) {
  const judged = list.filter((g) => g.mean != null);
  const recent = judged.slice(-20);
  if (recent.length < 5) return null;
  const from = recent[0].start;
  const deltas = recent.map((g) => {
    const before = judged.filter((x) => x.pair === g.pair && x.start < from);
    return before.length >= 5 ? g.mean - avg(before.map((x) => x.mean)) : null;
  }).filter((d) => d != null);
  return { value: deltas.length ? avg(deltas) : null, compared: deltas.length, games: recent.length, from, pos: avg(recent.map((g) => g.mean)) };
}
/** One main: its last 10 games against its earlier ones. */
function mainTrend(games) {
  const judged = games.filter((g) => g.mean != null);
  const recent = judged.slice(-10), before = judged.slice(0, -10);
  const change = before.length >= 5 && recent.length >= 5 ? avg(recent.map((g) => g.mean)) - avg(before.map((g) => g.mean)) : null;
  const rising = historyProfile(recent).map((e) => {
    const old = before.filter((g) => g.pos[e.id] != null).map((g) => g.pos[e.id]);
    return { id: e.id, d: old.length >= 5 && e.n >= 5 ? e.delta + 50 - avg(old) : null };
  }).filter((e) => e.d != null).sort((a, b) => b.d - a.d);
  return { pos: recent.length ? avg(recent.map((g) => g.mean)) : null, change, best: rising[0] || null, winNow: recent.length ? avg(recent.map((g) => +g.win)) : null };
}
const pts = (x, digits = 1) => (x == null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(digits)}`);

let statsLoad = 'idle';
/** Everyone's numbers; true once loaded, otherwise starts loading and calls back. */
function withStats(then) {
  if (window.CHAMPSTATS) return true;
  if (statsLoad === 'idle') {
    statsLoad = 'loading';
    const s = document.createElement('script');
    s.src = 'champions.js';
    s.onload = () => { statsLoad = 'ready'; then(); };
    s.onerror = () => { statsLoad = 'failed'; then(); };
    document.head.appendChild(s);
  }
  return false;
}
const statOf = (pair, tier) => window.CHAMPSTATS?.champs[pair]?.[tier] || null;
const ALL_TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER'];

let intel = { pair: null, games: 25, role: '', sRole: '', sTier: null, sort: 'n', dir: -1, q: '', open: null, shown: 40 };
function viewIntel() {
  if (needAccount()) return;
  const p = P(), tier = p.tier, tg = statsTier(tier);
  const all = rankedHistory();
  const ready = withStats(() => { if ((location.hash || '').startsWith('#/intel')) viewIntel(); });
  const cs = window.CHAMPSTATS;
  const head = `<div class="route-title"><p class="eyebrow">Read the game</p><h1>Intelligence</h1><p>${all.length ? `Your ${all.length} ranked solo games since ${monthYear(all[0].start)}, against every ${tierName(tier)} player with the same champion and role.` : 'Your ranked solo games, against the players of your tier.'}</p></div>`;
  if (!all.length) { app.innerHTML = `${head}<p class="muted">No ranked solo games found for this account yet.</p>`; return; }
  const ms = historyMains(all);
  if (!intel.pair || !ms.some((m) => m.pair === intel.pair)) intel.pair = ms[0].pair;
  if (!intel.sTier) intel.sTier = tg;
  const t = totals(all);
  app.innerHTML = `${head}
  <section class="intel-kpis" aria-label="Your ranked solo games">
    <div><span>Games</span><strong>${t.n}</strong><small>${dayYear(all[0].start)} – ${dayYear(all.at(-1).start)}</small></div>
    <div><span>Win rate</span><strong>${pct(t.win)}</strong><small>${all.filter((g) => g.win).length} won, ${all.filter((g) => !g.win).length} lost</small></div>
    <div><span>KDA</span><strong>${t.kda.toFixed(2)}</strong><small>median game · ${(t.d).toFixed(1)} deaths</small></div>
    <div><span>CS per minute</span><strong>${t.cspm.toFixed(1)}</strong><small>${Math.round(t.dpm)} damage per minute</small></div>
    <div><span>Position vs ${tierName(tier)}</span><strong>${t.pos == null ? '—' : Math.round(t.pos)}</strong><small>50 is the average player · ${t.judged} games judged</small></div>
    <div><span>Champions</span><strong>${new Set(all.map((g) => g.champ)).size}</strong><small>${Object.entries(all.reduce((a, g) => ((a[g.role] = (a[g.role] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([r, n]) => `${ROLES[r]} ${pct(n / all.length)}`).join(' · ')}</small></div>
  </section>
  <section class="intel-block"><header class="panel-head"><div><p class="eyebrow">Your mains</p><h2>The champions you play most</h2></div></header>
    <div class="main-cards">${ms.filter((m) => m.games.length >= 5).slice(0, 6).map((m) => mainCard(m, tg, cs)).join('')}</div>
    <div id="main-detail"></div>
  </section>
  <section class="intel-block"><header class="panel-head"><div><p class="eyebrow">Match history</p><h2>All your ranked games</h2></div><span class="small muted">Every ranked solo game, signed up or not</span></header>
    <div class="chips" id="games-roles"></div><div id="games-table"></div>
  </section>
  <section class="intel-block"><header class="panel-head"><div><p class="eyebrow">Every champion</p><h2>Champion statistics</h2></div><span class="small muted">${cs ? `${cs.games.ALL.toLocaleString('en-GB')} ranked solo games, EUW, patches ${cs.versions.map((v) => v[0]).slice(0, 4).sort().join(', ')}` : ''}</span></header>
    <div id="champ-stats">${ready ? '' : statsLoad === 'failed' ? '<p class="muted">Could not load the champion statistics. Reload the page to try again.</p>' : '<p class="muted">Loading everyone\'s numbers…</p>'}</div>
  </section>`;
  renderMainDetail();
  renderGames();
  if (ready) renderChampStats();
  app.querySelectorAll('[data-main]').forEach((b) => (b.onclick = () => { intel.pair = b.dataset.main; app.querySelectorAll('[data-main]').forEach((x) => x.classList.toggle('on', x.dataset.main === intel.pair)); renderMainDetail(); }));
}
function mainCard(m, tg, cs) {
  const t = totals(m.games), st = cs && statOf(m.pair, tg), tr = mainTrend(m.games);
  return `<button class="mcard ${m.pair === intel.pair ? 'on' : ''}" data-main="${m.pair}">${icon(splitPair(m.pair).champ)}<span class="mname"><b>${pairLabel(m.pair)}</b><small>${m.games.length} games</small></span>
  <span class="mstat"><small>Win rate</small><b>${pct(t.win)}</b>${st ? `<em class="${t.win >= st.win ? 'up' : 'down'}">${pts((t.win - st.win) * 100, 0)} vs ${tierName(tg)}</em>` : ''}</span>
  <span class="mstat"><small>Position</small><b>${t.pos == null ? '—' : Math.round(t.pos)}</b>${tr.change != null ? `<em class="${tr.change >= 0 ? 'up' : 'down'}">${pts(tr.change)} lately</em>` : ''}</span></button>`;
}
function renderMainDetail() {
  const el = $('#main-detail');
  if (!el) return;
  const tier = P().tier, tg = statsTier(tier);
  const games = rankedHistory().filter((g) => g.pair === intel.pair);
  const t = totals(games), st = statOf(intel.pair, tg), sa = statOf(intel.pair, 'ALL');
  const rows = [
    ['Win rate', t.win, st?.win, sa?.win, (x) => pct(x), 1],
    ['KDA (median game)', t.kda, st?.stats.kda, sa?.stats.kda, (x) => x.toFixed(2), 1],
    ['Deaths per game', t.d, st?.stats.deaths, sa?.stats.deaths, (x) => x.toFixed(1), -1],
    ['Kill participation', t.kp, st?.stats.kp, sa?.stats.kp, (x) => pct(x), 1],
    ['Damage per minute', t.dpm, st?.stats.dpm, sa?.stats.dpm, (x) => Math.round(x), 1],
    ['Gold per minute', t.gpm, st?.stats.gpm, sa?.stats.gpm, (x) => Math.round(x), 1],
    ['CS per minute', t.cspm, st?.stats.cspm, sa?.stats.cspm, (x) => x.toFixed(1), 1],
    ['Vision per minute', t.vpm, st?.stats.vpm, sa?.stats.vpm, (x) => x.toFixed(2), 1],
    ['Game length', t.minutes, st?.minutes, sa?.minutes, (x) => `${x.toFixed(1)} min`, 0],
  ];
  const prof = historyProfile(games);
  // Average position per block of 10 games, oldest first.
  const judged = games.filter((g) => g.mean != null);
  const blocks = [];
  for (let i = 0; i + 10 <= judged.length; i += 10) blocks.push(avg(judged.slice(i, i + 10).map((g) => g.mean)));
  const opps = Object.entries(games.reduce((a, g) => { if (g.opp) (a[g.opp] ||= []).push(g); return a; }, {}))
    .map(([c, gs]) => ({ c, gs })).filter((o) => o.gs.length >= 2).sort((a, b) => b.gs.length - a.gs.length).slice(0, 8);
  const tr = mainTrend(games);
  el.innerHTML = `<div class="main-detail">
    <div class="md-head">${icon(splitPair(intel.pair).champ, 'champ lg')}<div><p class="eyebrow">${games.length} games · ${dayYear(games[0].start)} – ${dayYear(games.at(-1).start)}</p><h3>${pairLabel(intel.pair)}: you against ${tierName(tg)}</h3></div></div>
    <div class="md-grid">
      <div><h4>Your numbers</h4><div class="tablewrap"><table class="num vs"><tr><th></th><th>You</th><th>${tierName(tg)}</th><th>All tiers</th></tr>
      ${rows.map(([name, you, them, every, f, dir]) => `<tr><td>${name}</td><td><b>${f(you)}</b>${them != null && dir ? ` <em class="${(you - them) * dir >= 0 ? 'up' : 'down'}">${(you - them) * dir >= 0 ? '▲' : '▼'}</em>` : ''}</td><td>${them == null ? '<span class="muted">—</span>' : f(them)}</td><td class="muted">${every == null ? '—' : f(every)}</td></tr>`).join('')}</table></div>
      <p class="small muted">${st ? `${tierName(tg)}: ${st.n.toLocaleString('en-GB')} games with ${pairLabel(intel.pair)}, picked in ${pct(st.pick)} of ${ROLES[splitPair(intel.pair).role]} games.` : statsLoad === 'loading' ? 'Loading everyone\'s numbers…' : `Fewer than ${window.CHAMPSTATS?.min ?? 30} ${tierName(tg)} games with this champion and role in our data.`}</p></div>
      <div><h4>Challenges: your position among ${tierName(tier)} players</h4>${prof.length ? divergingChart(prof) : '<p class="muted small">No challenge is offered for this champion and role yet: it is played too rarely.</p>'}
      ${blocks.length >= 2 ? `<h4 style="margin-top:18px">Over time</h4>${trendChart(blocks)}<p class="small muted">Average position per 10 games, oldest first.${tr.change != null ? ` Last 10 games against the earlier ones: <b>${pts(tr.change)}</b>.` : ''}</p>` : ''}</div>
    </div>
    ${opps.length ? `<h4>Against your lane opponents</h4><div class="tablewrap"><table class="num"><tr><th>Opponent</th><th>Games</th><th>Your win rate</th><th>Your KDA</th><th>Your position</th></tr>${opps.map((o) => { const x = totals(o.gs); return `<tr><td>${icon(o.c)} ${champName(o.c)}</td><td>${o.gs.length}</td><td>${pct(x.win)}</td><td>${x.kda.toFixed(2)}</td><td>${x.pos == null ? '—' : Math.round(x.pos)}</td></tr>`; }).join('')}</table></div>` : ''}
  </div>`;
}
function trendChart(values) {
  const w = 320, h = 90, pad = 6, max = 80, min = 20;
  const x = (i) => pad + (i * (w - 2 * pad)) / Math.max(1, values.length - 1);
  const y = (v) => h - pad - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (h - 2 * pad);
  return `<svg class="trend" viewBox="0 0 ${w} ${h}" role="img" aria-label="Average position per 10 games: ${values.map((v) => Math.round(v)).join(', ')}"><line class="mid" x1="${pad}" x2="${w - pad}" y1="${y(50)}" y2="${y(50)}"/><text x="${w - pad}" y="${y(50) - 4}" text-anchor="end">50</text><polyline points="${values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>${values.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3"><title>${Math.round(v)}</title></circle>`).join('')}</svg>`;
}
function renderGames() {
  const roles = [...new Set(rankedHistory().map((g) => g.role))];
  $('#games-roles').innerHTML = [['', 'All roles'], ...roles.map((r) => [r, ROLES[r]])].map(([r, n]) => `<button class="chip ${intel.role === r ? 'on' : ''}" data-grole="${r}">${n}</button>`).join('');
  const list = rankedHistory().filter((g) => !intel.role || g.role === intel.role).slice().reverse();
  const shown = list.slice(0, intel.games);
  $('#games-table').innerHTML = `<div class="tablewrap"><table class="num games"><tr><th>Date</th><th>Champion</th><th>Result</th><th>K / D / A</th><th>CS</th><th>Damage</th><th>Vision</th><th>Length</th><th>Above your tier</th></tr>
  ${shown.map((g) => `<tr><td>${dayYear(g.start)}<div class="small muted">${g.patch ? `patch ${g.patch}` : ''}</div></td><td class="gchamp">${icon(g.champ)}<span><b>${champName(g.champ)}</b><small>${ROLES[g.role]}${g.opp ? ` · vs ${champName(g.opp)}` : ''}</small></span></td><td class="${g.win ? 'w' : 'l'}"><b>${g.win ? 'Win' : 'Loss'}</b></td><td>${g.k} / ${g.d} / ${g.a}</td><td>${g.cs}<div class="small muted">${(g.cs / g.minutes).toFixed(1)}/min</div></td><td>${g.dmg.toLocaleString('en-GB')}</td><td>${g.vis}</td><td>${Math.round(g.minutes)} min</td><td>${g.of ? `<b>${g.above}/${g.of}</b>` : '<span class="muted">no challenges</span>'}</td></tr>`).join('')}</table></div>
  ${list.length > shown.length ? `<button class="btn ghost small" id="more-games">Show ${Math.min(25, list.length - shown.length)} more (${list.length - shown.length} left)</button>` : ''}`;
  $('#games-roles').querySelectorAll('[data-grole]').forEach((b) => (b.onclick = () => { intel.role = b.dataset.grole; intel.games = 25; renderGames(); }));
  const more = $('#more-games');
  if (more) more.onclick = () => { intel.games += 25; renderGames(); };
}
const STAT_COLS = [['n', 'Games'], ['win', 'Win rate'], ['pick', 'Popularity'], ['kda', 'KDA'], ['deaths', 'Deaths'], ['dpm', 'Damage/min'], ['gpm', 'Gold/min'], ['cspm', 'CS/min'], ['minutes', 'Length']];
const statVal = (e, k) => (['n', 'win', 'pick', 'minutes'].includes(k) ? e[k] : e.stats[k]);
const statFmt = (k, v) => (v == null ? '—' : k === 'n' ? v.toLocaleString('en-GB') : k === 'win' || k === 'pick' ? `${(v * 100).toFixed(1)}%` : k === 'kda' ? v.toFixed(2) : k === 'deaths' ? v.toFixed(1) : k === 'cspm' ? v.toFixed(1) : k === 'minutes' ? `${v.toFixed(1)}` : Math.round(v));
function renderChampStats() {
  const box = $('#champ-stats');
  if (!box || !window.CHAMPSTATS) return;
  const cs = window.CHAMPSTATS;
  const mine = historyMains();
  const myOf = (pair) => mine.find((m) => m.pair === pair);
  if (!$('#st-table')) {
    box.innerHTML = `<div class="row filters"><label class="fld">Role <select id="st-role"><option value="">All roles</option>${Object.entries(ROLES).map(([r, n]) => `<option value="${r}" ${intel.sRole === r ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="fld">Tier <select id="st-tier"><option value="ALL" ${intel.sTier === 'ALL' ? 'selected' : ''}>All tiers</option>${ALL_TIERS.map((x) => `<option value="${x}" ${intel.sTier === x ? 'selected' : ''}>${tierName(x)}</option>`).join('')}</select></label>
    <label class="fld grow">Champion <input type="text" id="st-q" placeholder="Search a champion" value="${esc(intel.q)}" autocomplete="off"></label></div>
    <div id="st-table"></div>`;
    $('#st-role').onchange = (e) => { intel.sRole = e.target.value; intel.shown = 40; renderChampStats(); };
    $('#st-tier').onchange = (e) => { intel.sTier = e.target.value; intel.shown = 40; renderChampStats(); };
    $('#st-q').oninput = (e) => { intel.q = e.target.value; intel.shown = 40; renderChampStats(); };
  }
  const q = intel.q.trim().toLowerCase();
  const rows = Object.entries(cs.champs).map(([pair, tiers]) => ({ pair, e: tiers[intel.sTier] })).filter((r) => r.e)
    .filter((r) => (!intel.sRole || splitPair(r.pair).role === intel.sRole) && (!q || champName(splitPair(r.pair).champ).toLowerCase().includes(q)))
    .sort((a, b) => ((statVal(a.e, intel.sort) ?? -1) - (statVal(b.e, intel.sort) ?? -1)) * intel.dir || a.pair.localeCompare(b.pair));
  const shown = rows.slice(0, intel.shown);
  $('#st-table').innerHTML = `<p class="small muted">${rows.length} champions and roles with at least ${cs.min} games${intel.sTier === 'ALL' ? '' : ` in ${tierName(intel.sTier)}`}. Popularity: share of ${intel.sRole ? ROLES[intel.sRole] : 'its role\'s'} games where it was picked. Click a row for its details.</p>
  <div class="tablewrap"><table class="num stats"><tr><th>Champion</th>${STAT_COLS.map(([k, n]) => `<th><button class="sort ${intel.sort === k ? 'on' : ''}" data-sort="${k}">${n}${intel.sort === k ? (intel.dir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`).join('')}<th>You</th></tr>
  ${shown.map(({ pair, e }) => { const m = myOf(pair); const open = intel.open === pair; return `<tr class="srow ${m ? 'yours' : ''} ${open ? 'open' : ''}" data-open="${pair}"><td class="gchamp">${icon(splitPair(pair).champ)}<span><b>${champName(splitPair(pair).champ)}</b><small>${ROLES[splitPair(pair).role]}</small></span></td>${STAT_COLS.map(([k]) => `<td>${statFmt(k, statVal(e, k))}</td>`).join('')}<td>${m ? `<b>${pct(totals(m.games).win)}</b><div class="small muted">${m.games.length} games</div>` : ''}</td></tr>${open ? `<tr class="sdetail"><td colspan="${STAT_COLS.length + 2}">${champDetail(pair, m)}</td></tr>` : ''}`; }).join('')}</table></div>
  ${rows.length > shown.length ? `<button class="btn ghost small" id="more-champs">Show 40 more (${rows.length - shown.length} left)</button>` : ''}`;
  $('#st-table').querySelectorAll('[data-sort]').forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); const k = b.dataset.sort; intel.dir = intel.sort === k ? -intel.dir : -1; intel.sort = k; renderChampStats(); }));
  $('#st-table').querySelectorAll('[data-open]').forEach((r) => (r.onclick = () => { intel.open = intel.open === r.dataset.open ? null : r.dataset.open; renderChampStats(); }));
  const more = $('#more-champs');
  if (more) more.onclick = () => { intel.shown += 40; renderChampStats(); };
}
function champDetail(pair, mine) {
  const tiers = window.CHAMPSTATS.champs[pair];
  const tier = P().tier;
  const ref = tiers[intel.sTier] || tiers.ALL;
  const byTier = ALL_TIERS.map((t) => [t, tiers[t]]).filter(([, e]) => e);
  const lens = ['under 25 min', '25-30 min', '30-35 min', 'over 35 min'];
  const myGames = mine ? mine.games : [];
  const offered = Object.keys(offersOf(pair));
  const ids = D.challenges.map((c) => c.id).filter((id) => ref.ch[id] != null);
  const myMedian = (id) => { const xs = myGames.map((g) => g.v[id]).filter((v) => v != null); return xs.length >= 5 ? median(xs) : null; };
  return `<div class="cdetail">
    <div><h4>Win rate by tier</h4><div class="bars">${byTier.map(([t, e]) => `<div title="${tierName(t)}: ${(e.win * 100).toFixed(1)}% over ${e.n} games"><i style="height:${Math.max(4, (e.win - 0.4) * 400)}px"></i><b>${(e.win * 100).toFixed(0)}%</b><small>${t.slice(0, 3)}</small></div>`).join('')}</div></div>
    <div><h4>Win rate by game length</h4><div class="bars">${ref.len.map((w, i) => `<div title="${lens[i]}"><i style="height:${w == null ? 0 : Math.max(4, (w - 0.4) * 400)}px"></i><b>${w == null ? '—' : `${(w * 100).toFixed(0)}%`}</b><small>${lens[i].replace(' min', '')}</small></div>`).join('')}</div></div>
    <div class="grow"><h4>Typical game${intel.sTier === 'ALL' ? '' : ` in ${tierName(intel.sTier)}`}${myGames.length ? ' and yours' : ''}</h4><div class="tablewrap"><table class="num"><tr><th>Challenge</th><th>Typical</th>${myGames.length ? '<th>You</th>' : ''}<th></th></tr>${ids.map((id) => `<tr><td>${CH[id].name}</td><td>${fmt(id, ref.ch[id])}</td>${myGames.length ? `<td>${fmt(id, myMedian(id))}</td>` : ''}<td class="small muted">${offered.includes(id) ? '' : 'not offered'}</td></tr>`).join('')}</table></div>
    <p class="small muted">Median game. Thresholds for ${tierName(tier)} are in Training and contests.</p></div>
  </div>`;
}

// Training reads the account's whole ranked history (app/history.js) and, for each game, its timeline
// (app/training.js: teams, builds, the lane phase, curves, and the tier's average player per champion and role).
// Every game is read on plain numbers (farm, early deaths, lane gaps, vision...) against the average player of the
// tier with the same champion; challenges stay for contests. Signed-up games enter training contests.
let trainLoad = 'idle';
/** The timeline data; true once loaded, otherwise starts loading and calls back. */
function withTraining(then) {
  if (window.TRAINING) return true;
  if (trainLoad === 'idle') {
    trainLoad = 'loading';
    const s = document.createElement('script');
    s.src = 'training.js';
    s.onload = () => { trainLoad = 'ready'; then(); };
    s.onerror = () => { trainLoad = 'failed'; then(); };
    document.head.appendChild(s);
  }
  return false;
}
let hbs = null;
/** The ranked game Riot keeps for a signed-up game, by its real start (src), or by match id. */
function historyGame(g) {
  const list = rankedHistory();
  if (!hbs || hbs.list !== list) hbs = { list, m: new Map(list.map((x) => [x.start, x])), id: new Map(list.map((x) => [x.id, x])) };
  return g.id && hbs.id.has(g.id) ? hbs.id.get(g.id) : hbs.m.get(g.src) || null;
}
/** The signed-up game behind a ranked game, if any. */
const signedOf = (h) => S.games.find((g) => g.analysed && g.src === h.start) || null;
const tlOf = (h) => (h && window.TRAINING?.games[h.id]) || null;
const tierAvg = (pair) => window.TRAINING?.pairs[pair] || null;
const tnT = () => tierName(window.TRAINING?.tier || P().tier);
const MONTH = 30 * DAY;
const bandName = (a) => (a?.band === 'near' ? `around ${tnT()}` : tnT());
const sgn = (x, d = 0) => (x == null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toLocaleString('en-GB', { maximumFractionDigits: d, minimumFractionDigits: d })}`);
const LP_PER_GAME = 20; // rough Emerald LP per win or loss: Riot keeps no LP per game, so this is an estimate
// The numbers a game is read on. get reads a ranked game (h) and its timeline (t); tier reads the average player of
// the tier with the same champion: s from everyone's numbers (champions.js), a from the lab's timelines.
// scale is the gap that counts as clearly worse (or better).
const METRICS = [
  { k: 'cspm', name: 'CS per minute', fix: 'Improve your farm', bad: 'Low farm', good: 'Good farm', get: (h) => h.cs / h.minutes, tier: (s) => s?.stats.cspm, f: (x) => x.toFixed(1), better: 1, scale: 0.6, noRole: ['UTILITY'], tip: 'Last-hit every minion you can before you trade, and back when the wave is pushed towards the enemy, so you never lose a full wave.' },
  { k: 'd14', name: 'Deaths before minute 14', fix: 'Die less early', bad: 'Early deaths', good: 'Safe lane', get: (h, t) => t?.d14, tierA: (a) => a?.d14, f: (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1)), better: -1, scale: 1, tip: 'Until minute 14 a death costs more than any trade wins: when you don\'t know where the enemy jungler is, stay behind your wave.' },
  { k: 'xp10', name: 'XP gap at 10 minutes', fix: 'You lose experience in lane', bad: 'XP behind', good: 'XP ahead', get: (h, t) => t?.at[10]?.[2], tierA: (a) => a?.at[10]?.[2], f: (x) => sgn(x), better: 1, scale: 300, noRole: ['JUNGLE'], tip: 'Stay in range of the dying minions: every wave you miss is experience your opponent takes alone.' },
  { k: 'cs10', name: 'CS gap at 10 minutes', fix: 'You fall behind in lane farm', bad: 'CS behind', good: 'CS ahead', get: (h, t) => t?.at[10]?.[0], tierA: (a) => a?.at[10]?.[0], f: (x) => sgn(x), better: 1, scale: 8, noRole: ['UTILITY'], tip: 'Farm under your tower instead of giving up the wave when your opponent pushes: a lost wave is about 8 CS.' },
  { k: 'gold14', name: 'Gold gap at 14 minutes', fix: 'You lose the lane', bad: 'Lost lane', good: 'Won lane', get: (h, t) => t?.at[14]?.[1], tierA: (a) => a?.at[14]?.[1], f: (x) => sgn(x), better: 1, scale: 500, tip: 'Lane gold is minions, plates and kills: keep the wave, hit plates when your opponent is back, and don\'t give kills.' },
  { k: 'plL', name: 'Plates lost before 14', fix: 'Your tower loses its plates', bad: 'Plates lost', good: 'Kept plates', get: (h, t) => t?.plates?.[1], tierA: (a) => a?.plates?.[1], f: (x) => x.toFixed(1), better: -1, scale: 1.5, noRole: ['JUNGLE'], tip: 'Plates fall when you back with the enemy wave on your tower: push the wave first, then back.' },
  { k: 'deaths', name: 'Deaths per game', fix: 'Die less', bad: 'Many deaths', good: 'Few deaths', get: (h) => h.d, tier: (s) => s?.stats.deaths, f: (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1)), better: -1, scale: 1.8, tip: 'Most late deaths come from walking into fog alone: move with a teammate or a ward after minute 20.' },
  { k: 'kp', name: 'Kill participation', fix: 'Join your team\'s fights', bad: 'Low KP', good: 'High KP', get: (h) => h.kp, tier: (s) => s?.stats.kp, f: (x) => pct(x), better: 1, scale: 0.08, tip: 'Look at the map when your lane is pushed: move to the next fight before it starts, not after.' },
  { k: 'vpm', name: 'Vision per minute', fix: 'Ward and clear more', bad: 'Low vision', good: 'Good vision', get: (h) => h.vis / h.minutes, tier: (s) => s?.stats.vpm, f: (x) => x.toFixed(2), better: 1, scale: 0.25, tip: 'Buy a control ward every back and use your trinket on cooldown; clear the enemy wards before each objective.' },
  { k: 'dpm', name: 'Damage per minute', fix: 'Deal more damage in fights', bad: 'Low damage', good: 'High damage', get: (h) => h.dmg / h.minutes, tier: (s) => s?.stats.dpm, f: (x) => String(Math.round(x)), better: 1, scale: 150, tip: 'Use your spells on the enemies in reach, not on cooldowns: damage comes from being in range when the fight starts.' },
];
const MET = Object.fromEntries(METRICS.map((m) => [m.k, m]));
const gmCache = new Map();
/** One ranked game on every number: its value, the tier's, and how far worse (positive) or better (negative). */
function gameMetrics(h) {
  const key = `${h.id}:${!!window.TRAINING}:${!!window.CHAMPSTATS}`;
  if (gmCache.has(key)) return gmCache.get(key);
  const t = tlOf(h), s = statOf(h.pair, statsTier(P().tier)), a = tierAvg(h.pair), role = splitPair(h.pair).role;
  const out = {};
  for (const m of METRICS) {
    if (m.noRole?.includes(role)) continue;
    const v = m.get(h, t), ref = m.tier ? m.tier(s) : m.tierA(a);
    if (v == null || ref == null || !Number.isFinite(v)) continue;
    out[m.k] = { v, ref, sev: ((ref - v) * m.better) / m.scale };
  }
  gmCache.set(key, out);
  return out;
}
/** The same numbers over several games: means, and the severity grown with the games that show it. */
function groupMetrics(games, shrink = true) {
  const per = games.map(gameMetrics);
  const n = games.length, k = shrink ? n / (n + 4) : 1;
  return METRICS.map((m) => {
    const xs = per.map((p) => p[m.k]).filter(Boolean);
    if (!xs.length) return null;
    return { ...m, v: avg(xs.map((x) => x.v)), ref: avg(xs.map((x) => x.ref)), sev: avg(xs.map((x) => x.sev)) * k, n: xs.length };
  }).filter(Boolean).sort((a, b) => b.sev - a.sev);
}
/** Small labels for one game: the numbers clearly worse than the tier first, then one clearly better. */
function metricTags(h, bad = 3, good = 1) {
  const g = gameMetrics(h);
  const list = Object.entries(g).map(([k, x]) => ({ m: MET[k], ...x })).sort((a, b) => b.sev - a.sev);
  const worse = list.filter((x) => x.sev >= 1).slice(0, bad), better = list.filter((x) => x.sev <= -1).reverse().slice(0, good);
  const t = (x, cls, label) => `<span class="cc ${cls}" title="${x.m.name}: ${x.m.f(x.v)}, ${tnT()} ${x.m.f(x.ref)}">${label}</span>`;
  return `${worse.map((x) => t(x, 'down', x.m.bad)).join('')}${better.map((x) => t(x, 'up', x.m.good)).join('')}`;
}
/** Win rate of the tier's same champion with 0 and with 2+ deaths before minute 14. */
function earlyCost(pair) {
  const a = tierAvg(pair);
  if (!a || a.early[0][0] < 20 || a.early[2][0] < 20) return null;
  const w = (b) => Math.round((b[1] / b[0]) * 100);
  return { none: w(a.early[0]), two: w(a.early[2]), n: a.early[0][0] + a.early[1][0] + a.early[2][0] };
}
/** The account's champions in the last 30 days, the ones with most to fix first. */
function improveList() {
  const recent = rankedHistory().filter((g) => g.start >= S.now - MONTH);
  const by = new Map();
  for (const g of recent) by.set(g.pair, [...(by.get(g.pair) || []), g]);
  return [...by].map(([pair, games]) => {
    const ms = groupMetrics(games);
    const wins = games.filter((g) => g.win).length;
    return { pair, games, wins, net: 2 * wins - games.length, ms, bad: ms.filter((x) => x.sev >= 0.5), sev: Math.max(0, ms[0]?.sev ?? 0) };
  }).sort((a, b) => b.sev - a.sev || b.games.length - a.games.length);
}
let trainChamp = null, trainRole = null, trainMode = 'champ', trainDays = 30;
// The numbers in the order the champion view shows them: the lane first, then the whole game.
const LANE_KEYS = ['cs10', 'xp10', 'gold14', 'd14', 'plL'], GAME_KEYS = ['cspm', 'deaths', 'kp', 'vpm', 'dpm'];
/** A gap in words a player knows: waves of minions, levels, kills. */
function plain(k, gap) {
  const a = Math.abs(gap), more = gap >= 0;
  if (k === 'cs10' && a >= 3) return `${(a / 6.5).toFixed(1)} waves ${more ? 'ahead' : 'behind'}`;
  if (k === 'xp10' && a >= 150) return `${a >= 900 ? `${(a / 900).toFixed(1)} levels` : a >= 600 ? 'two thirds of a level' : a >= 400 ? 'half a level' : 'a third of a level'} ${more ? 'ahead' : 'behind'}`;
  if (k === 'gold14' && a >= 150) return `${a >= 450 ? `${(a / 300).toFixed(1)} kills` : 'about a kill'} of gold ${more ? 'ahead' : 'behind'}`;
  if (k === 'cspm' && a >= 0.2) return `${Math.round(a * 25)} CS a game, about ${Math.round((a * 25 * 21) / 50) * 50} gold`;
  return '';
}
const wordsOf = (x) => plain(x.k, ['cs10', 'xp10', 'gold14'].includes(x.k) ? x.v : x.v - x.ref);
/** A bar centred on the tier's average: left when worse, right when better; the tick is your usual. */
function gapBar(sev, usualSev) {
  const pos = (s) => Math.max(-1, Math.min(1, -s / 2.5)) * 50;
  const p = pos(sev), cls = sev >= 0.5 ? 'bad' : sev <= -0.5 ? 'good' : 'even';
  return `<span class="gbar"><i class="${cls}" style="${p < 0 ? `right:50%;width:${-p}%` : `left:50%;width:${p}%`}"></i>${usualSev != null ? `<u style="left:${50 + pos(usualSev)}%" title="Your usual"></u>` : ''}</span>`;
}
/** A small line of monthly values, the last point marked. */
function trendLine(vals, better) {
  if (vals.length < 3) return '<span class="tline muted small">—</span>';
  const w = 70, h = 22, lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const pts = vals.map((v, i) => [(i * w) / (vals.length - 1), h - 3 - ((v - lo) / span) * (h - 6)]);
  const up = (vals.at(-1) - vals[0]) * better > 0;
  return `<svg class="tline ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-label="Last months: ${up ? 'improving' : 'getting worse'}"><polyline points="${pts.map((p) => p.map((x) => x.toFixed(1)).join(',')).join(' ')}"/><circle cx="${pts.at(-1)[0].toFixed(1)}" cy="${pts.at(-1)[1].toFixed(1)}" r="2.5"/></svg>`;
}
function viewTrain(arg = '') {
  if (needAccount()) return;
  const [sub, id] = arg.split('/');
  if (sub === 'game') return viewGame(id);
  if (sub === 'match') return viewGame(null, id);
  if (sub === 'contest') return viewImpContest(id);
  if (sub === 'signups') return viewPastSignups();
  if (sub) { location.replace('#/train'); return; }
  const again = () => { if ((location.hash || '#/train') === '#/train') viewTrain(); };
  const ready = withTraining(again) & withStats(again);
  const contest = Object.values(S.imp).find((c) => c.state === 'open' && c.entries.some((e) => e.you));
  const head = `<div class="route-title"><p class="eyebrow">Improve yourself</p><h1>Training</h1><p>Where you see what's wrong and fix it, against the average ${tierName(P().tier)} player with the same champion.</p></div>`;
  trainContest = contest;
  if (!ready) { app.innerHTML = `${head}<p class="muted">${trainLoad === 'failed' || statsLoad === 'failed' ? 'Could not load your games\' data. Reload the page to try again.' : 'Loading your games…'}</p>`; return; }
  const list = improveList();
  app.innerHTML = `${head}${pickBar(list)}${champView(list)}${matchHistory()}`;
  bindTrain();
}
let trainContest = null;
/** The bar on top: the slider (champions to improve first), the role and the lock, and what is waiting. */
function pickBar(list) {
  const fix = list.filter((c) => c.sev >= 0.5).map((c) => splitPair(c.pair).champ);
  const played = historyMains().map((m) => splitPair(m.pair).champ);
  const rest = [...new Set(pairKeys.map((k) => splitPair(k).champ))].sort((a, b) => champName(a).localeCompare(champName(b)));
  const champs = [...new Set([...fix, ...played, ...rest])];
  if (!trainChamp || !champs.includes(trainChamp)) trainChamp = champs[0];
  const roles = Object.keys(ROLES).filter((r) => D.pairs[`${r}|${trainChamp}`]);
  const mostRole = historyMains().find((m) => splitPair(m.pair).champ === trainChamp);
  if (!trainRole || !roles.includes(trainRole)) trainRole = mostRole ? splitPair(mostRole.pair).role : roles[0];
  const ci = champs.indexOf(trainChamp), fixSet = new Set(fix), pair = `${trainRole}|${trainChamp}`;
  const waiting = S.signups.filter((s) => s.kind === 'training' && active(s));
  return `<section class="pick-bar" aria-label="Your next game">
    <div class="carousel compact"><button class="cnav" data-cstep="-1" aria-label="Previous champion">‹</button><div class="ctrack" id="ctrack">${champs.map((c, i) => `<button class="citem ${i === ci ? 'on' : ''} ${fixSet.has(c) ? 'fix' : ''}" data-champ="${c}" style="--d:${Math.min(3, Math.abs(i - ci))}" aria-pressed="${i === ci}" title="${champName(c)}${fixSet.has(c) ? ': something to fix this month' : ''}">${icon(c)}<span>${champName(c)}</span></button>`).join('')}</div><button class="cnav" data-cstep="1" aria-label="Next champion">›</button></div>
    <div class="pick-act"><div class="chips">${roles.map((r) => `<button class="chip ${r === trainRole ? 'on' : ''}" data-trole="${r}">${ROLES[r]}</button>`).join('')}</div>
      <button class="btn" data-lock="${pair}">Lock ${pairLabel(pair)}</button>
      <span class="small muted">Your next ranked game with it enters a training contest: contests earn points for coaching, team try-outs and special tools. ${rl('signups')}</span>${trainContest ? `<a class="pick-contest" href="#/train/contest/${trainContest.id}">Contest #${num(trainContest.id)} · <b>${ord(standing(trainContest).me._place)}</b> ${standing(trainContest).text}</a>` : ''}</div>
    ${waiting.length ? `<div class="pick-wait">${waiting.map((s) => `<span>${icon(splitPair(s.pair).champ)}<b>Waiting: ${pairLabel(s.pair)}</b> <small>${s.status === 'unlocking' ? `unlocking until ${clock(s.unlockAt)}` : `since ${clock(s.at)}`}</small>${s.status === 'waiting' ? ` <button class="btn ghost small" data-unlock="${s.id}">Unlock</button>` : ''}</span>`).join('')}<button class="btn small" data-check="manual">Check my games</button><button class="btn ghost small" data-check="day">Skip to the end of the day</button>${S.signups.some((s) => s.kind === 'training' && !active(s)) ? ' <a class="small" href="#/train/signups">Past sign-ups</a>' : ''}</div>` : ''}
  </section>`;
}
/** The chosen champion on one screen: the priority, every number as a bar, the month's results. */
function champView(list) {
  const pair = `${trainRole}|${trainChamp}`, tn = tnT(), champ = champName(trainChamp);
  const all = rankedHistory().filter((g) => g.pair === pair);
  const month = all.filter((g) => g.start >= S.now - trainDays * DAY);
  const games = month.length ? month : all.slice(-20);
  const label = month.length ? (trainDays === 30 ? 'last 30 days' : 'last 3 months') : all.length ? `last ${games.length} games` : '';
  if (!all.length) return `<section class="champ-view empty"><h2>${pairLabel(pair)}</h2><p class="muted">No ranked game with ${pairLabel(pair)} yet: your first one sets the starting point.</p></section>`;
  const ms = groupMetrics(games, false), byK = Object.fromEntries(ms.map((x) => [x.k, x]));
  const usual = Object.fromEntries(groupMetrics(all, false).map((x) => [x.k, x]));
  const top = groupMetrics(games).find((x) => x.sev >= 0.5);
  const wins = games.filter((g) => g.win).length, net = 2 * wins - games.length;
  // Monthly values over the last nine months, for the trend of each number.
  const months = [];
  for (let i = 8; i >= 0; i--) { const to = S.now - i * MONTH, from = to - MONTH; const gs = all.filter((g) => g.start >= from && g.start < to); if (gs.length >= 2) months.push(gs); }
  const trend = (k) => trendLine(months.map((gs) => avg(gs.map((g) => gameMetrics(g)[k]?.v).filter((v) => v != null))).filter((v) => v != null && Number.isFinite(v)), MET[k].better);
  const row = (k) => {
    const x = byK[k];
    if (!x) return '';
    const u = usual[k], words = wordsOf(x);
    return `<div class="mrow ${x.sev >= 0.5 ? 'bad' : x.sev <= -0.5 ? 'good' : ''}"><span class="mname">${x.name}</span>${gapBar(x.sev, u && u !== x ? u.sev : null)}<span class="mval"><b>${x.f(x.v)}</b><small>${tn} ${x.f(x.ref)}${words ? ` · ${words}` : ''}</small></span>${trend(k)}</div>`;
  };
  const tl = games.map(tlOf).filter(Boolean), a = tierAvg(pair);
  const won = games.filter((g) => g.win).map(tlOf).filter(Boolean), lost = games.filter((g) => !g.win).map(tlOf).filter(Boolean);
  const series = [
    ...(won.length >= 3 ? [{ name: `Your wins (${won.length})`, cls: 'game', v: meanCurve(won.map((t) => t.cur), 'diff', 3) }] : []),
    ...(lost.length >= 3 ? [{ name: `Your losses (${lost.length})`, cls: 'you', v: meanCurve(lost.map((t) => t.cur), 'diff', 3) }] : []),
    ...(a?.cur?.diff?.length ? [{ name: `${tn} ${champ} (${a.n.toLocaleString('en-GB')})`, cls: 'tier', v: a.cur.diff }] : []),
  ].filter((s) => s.v.length >= 5);
  const cost = earlyCost(pair);
  return `<section class="champ-view" aria-label="${pairLabel(pair)}">
    <header class="cv-head">${icon(trainChamp, 'champ lg')}<div><p class="eyebrow">${label} · ${games.length} game${games.length > 1 ? 's' : ''}</p><h2>${pairLabel(pair)}</h2></div>
      <div class="cv-res"><b class="${net > 0 ? 'up' : net < 0 ? 'down' : ''}">${wins}W ${games.length - wins}L</b><small>${netText(net)} · ${lpText(net)}</small></div>
      <div class="chips">${[[30, '30 days'], [90, '3 months']].map(([d, n]) => `<button class="chip ${trainDays === d ? 'on' : ''}" data-tdays="${d}">${n}</button>`).join('')}</div></header>
    <div class="strip" aria-label="Results, oldest first">${games.map((g) => { const s = signedOf(g); return `<a class="sq ${g.win ? 'w' : 'l'}" href="${s ? `#/train/game/${s.id}` : `#/train/match/${g.id}`}" title="${day(g.start)} · ${g.win ? 'Win' : 'Loss'}${g.opp ? ` vs ${champName(g.opp)}` : ''} · ${g.k}/${g.d}/${g.a}"></a>`; }).join('')}</div>
    <div class="cv-grid">
      <div class="cv-main">
        ${top ? `<div class="priority"><p class="eyebrow">Priority</p><h3>${top.fix}</h3><p><b class="down">${top.f(top.v)}</b> · ${top.name} · average ${tn} ${champ} ${top.f(top.ref)}${wordsOf(top) ? ` · <b>${wordsOf(top)}</b>` : ''}</p><p class="small muted">${top.tip}${top.k === 'd14' && cost ? ` ${tn} ${champ} players with no death before minute 14 win ${cost.none}%; with 2 or more, ${cost.two}%.` : ''}</p></div>`
          : `<div class="priority calm"><p class="eyebrow">Priority</p><h3>Nothing clearly below your tier</h3><p class="small muted">Over the ${label}, every number is close to or above the average ${tn} ${champ}.</p></div>`}
        ${series.length ? `<div class="cv-chart"><h4>Gold gap to your lane opponent, minute by minute</h4><div class="curve-legend">${series.map((s) => `<span><i class="k-${s.cls}"></i>${s.name}</span>`).join('')}</div>${lineChart(`cv-${pair}`, 'diff', series, [])}</div>` : ''}
      </div>
      <div class="cv-rows">
        <div class="mhead"><span>Lane, first 14 minutes</span><span class="gscale"><small>worse</small><small>${tn}</small><small>better</small></span><span></span><span>9 months</span></div>
        ${LANE_KEYS.map(row).join('')}
        <div class="mhead"><span>Whole game</span><span></span><span></span><span></span></div>
        ${GAME_KEYS.map(row).join('')}
        <p class="small muted">The bar starts at the average ${tn} ${champ}; the tick is your usual over all ${all.length} games.</p>
      </div>
    </div>
    ${matchupBlock(pair, all)}
    ${buildCompare(pair, all)}
  </section>`;
}
/** Your hardest lane opponents with this pick: your record against each, next to what the matchup gives
 *  everyone with this champion (all tiers), and how the lane went. Over the whole history: matchups are rare. */
function matchupBlock(pair, all) {
  const mu = window.TRAINING?.matchups[pair] || {}, champ = champName(splitPair(pair).champ);
  const by = new Map();
  for (const g of all) if (g.opp) by.set(g.opp, [...(by.get(g.opp) || []), g]);
  const rows = [...by].filter(([, gs]) => gs.length >= 2).map(([opp, gs]) => {
    const w = gs.filter((g) => g.win).length, m = mu[opp], exp = m && m[0] >= 30 ? m[1] / m[0] : null;
    const ts = gs.map(tlOf).filter(Boolean);
    const g14 = avg(ts.map((t) => t.at[14]?.[1]).filter((v) => v != null)), d14 = ts.length ? avg(ts.map((t) => t.d14)) : null;
    return { opp, gs, w, wr: w / gs.length, exp, n: m?.[0] ?? 0, g14, d14, gap: exp == null ? null : w - exp * gs.length };
  });
  if (!rows.length) return '';
  // Worst first: the wins you are short of what the matchup gives, then, without data, your lowest win rate.
  rows.sort((a, b) => (a.gap ?? (a.wr - 0.5) * a.gs.length) - (b.gap ?? (b.wr - 0.5) * b.gs.length));
  const worst = rows.slice(0, 6);
  const verdict = (r) => {
    if (r.exp == null) return '<span class="muted">too few games in our data to say what it should be</span>';
    const e = Math.round(r.exp * 100);
    const lane = r.g14 != null && r.g14 > 300 && r.wr < 0.5 ? ' · <b class="down">you win the lane, then lose the game</b>' : '';
    if (r.wr < r.exp - 0.15 && r.exp >= 0.52) return `<b class="down">Should be yours:</b> ${champ} wins ${e}% of this lane${lane}`;
    if (r.exp >= 0.48 && r.exp < 0.52) return `<b>An even lane:</b> ${champ} wins ${e}%${lane}`;
    if (r.exp < 0.48) return `<b>Hard for ${champ}:</b> ${e}% for everyone${r.wr >= r.exp ? ', and you do as well or better' : ''}`;
    if (r.wr < r.exp - 0.15) return `<b class="down">Below what it gives:</b> ${champ} wins ${e}%${lane}`;
    return `${champ} wins ${e}% · you're in line with it`;
  };
  const bar = (r) => `<span class="mubar" title="Your win rate ${pct(r.wr)}${r.exp != null ? `, ${champ} in this matchup ${pct(r.exp)}` : ''}"><i class="${r.exp != null && r.wr < r.exp - 0.1 ? 'bad' : r.exp != null && r.wr > r.exp + 0.1 ? 'good' : ''}" style="width:${Math.round(r.wr * 100)}%"></i>${r.exp != null ? `<u style="left:${Math.round(r.exp * 100)}%"></u>` : ''}</span>`;
  return `<section class="cv-mu"><header class="panel-head"><div><p class="eyebrow">Lane opponents · since ${monthYear(all[0].start)}</p><h3>Your hardest matchups with ${pairLabel(pair)}</h3></div><span class="small muted">Bar: your win rate. Tick: what ${champ} wins in that matchup, every tier (games in our data).</span></header>
    <div class="mu-list">${worst.map((r) => { const last = r.gs.at(-1), s = signedOf(last); return `<a class="mu-row" href="${s ? `#/train/game/${s.id}` : `#/train/match/${last.id}`}" title="Open your last game against ${champName(r.opp)}">${icon(r.opp)}
      <span class="mu-name"><b>vs ${champName(r.opp)}</b><small>${r.gs.length} games · ${r.w}W ${r.gs.length - r.w}L</small></span>
      <span class="mu-wr">${bar(r)}<small>${verdict(r)}${r.exp != null ? ` <span class="muted">(${r.n.toLocaleString('en-GB')} games)</span>` : ''}</small></span>
      <span class="mu-lane"><b class="${r.g14 != null && r.g14 < -300 ? 'down' : r.g14 != null && r.g14 > 300 ? 'up' : ''}">${r.g14 == null ? '—' : sgn(Math.round(r.g14))}</b><small>gold at 14'${r.d14 != null ? ` · ${r.d14.toFixed(1)} deaths` : ''}</small></span></a>`; }).join('')}</div>
    ${rows.length > worst.length ? `<p class="small muted">${rows.length - worst.length} more opponents met at least twice.</p>` : ''}</section>`;
}
/** Your build with this pick against the tier's: completed items and boots at the end of the game, the first
 *  completed item, and your win rate with each. Descriptive: the games behind every number are shown. */
function buildCompare(pair, all) {
  const T = window.TRAINING, tb = T?.builds?.[pair], tn = tnT(), champ = champName(splitPair(pair).champ);
  const recent = all.filter((g) => g.start >= S.now - 3 * MONTH);
  const games = (recent.length >= 10 ? recent : all.slice(-40)).map((g) => ({ g, t: tlOf(g) })).filter((x) => x.t);
  if (games.length < 3) return '';
  const kind = (id) => T.items[id]?.[1];
  const mine = {}, first = {};
  for (const { g, t } of games) {
    const me = t.teams[t.side === 100 ? 0 : 1].find((p) => p[6]);
    for (const id of new Set((me?.[5] || []).filter((x) => ['item', 'boots'].includes(kind(x))))) { const c = (mine[id] ||= [0, 0]); c[0]++; if (g.win) c[1]++; }
    const f = t.buys.find(([, id]) => kind(id) === 'item');
    if (f) { const c = (first[f[1]] ||= [0, 0]); c[0]++; if (g.win) c[1]++; }
  }
  const n = games.length, wins = games.filter((x) => x.g.win).length;
  const share = (c, of) => (c ? c[0] / of : 0), wr = (c) => (c && c[0] ? c[1] / c[0] : null);
  const ids = [...new Set([...Object.entries(tb?.items || {}).sort((a, b) => b[1][0] - a[1][0]).slice(0, 8).map(([id]) => id), ...Object.entries(mine).sort((a, b) => b[1][0] - a[1][0]).slice(0, 8).map(([id]) => id)])];
  const rows = ids.map((id) => ({ id, you: mine[id], them: tb?.items[id], ys: share(mine[id], n), ts: tb ? share(tb.items[id], tb.n) : null }))
    .sort((a, b) => Math.max(b.ys, b.ts ?? 0) - Math.max(a.ys, a.ts ?? 0));
  const lines = [];
  // Your own wins and losses with an item, when there are games enough on both sides.
  const yours = Object.entries(mine).filter(([, c]) => c[0] >= 3 && c[0] <= n - 2).map(([id, c]) => ({ id, c, d: c[1] / c[0] - wins / n })).sort((a, b) => b.d - a.d);
  if (yours[0] && yours[0].d >= 0.12) lines.push(`<li class="up">With <b>${T.items[yours[0].id][0]}</b> you win <b>${pct(wr(yours[0].c))}</b> of ${yours[0].c[0]} games, against ${pct(wins / n)} overall.</li>`);
  const low = yours.at(-1);
  if (low && low !== yours[0] && low.d <= -0.12) lines.push(`<li class="down">With <b>${T.items[low.id][0]}</b> you win <b>${pct(wr(low.c))}</b> of ${low.c[0]} games.</li>`);
  if (tb) {
    const miss = rows.filter((r) => r.ts >= 0.25 && r.ys <= 0.1).sort((a, b) => b.ts - a.ts)[0];
    if (miss) lines.push(`<li><b>${T.items[miss.id][0]}</b>: ${pct(miss.ts)} of ${tn} ${champ} players finish with it, you ${miss.ys ? `in ${pct(miss.ys)} of your games` : 'never'}.</li>`);
    const odd = rows.filter((r) => r.ys >= 0.3 && (r.ts ?? 0) <= 0.08).sort((a, b) => b.ys - a.ys)[0];
    if (odd) lines.push(`<li><b>${T.items[odd.id][0]}</b>: in ${pct(odd.ys)} of your games, only ${pct(odd.ts || 0)} of ${tn} ${champ} players buy it.</li>`);
    const yf = Object.entries(first).sort((a, b) => b[1][0] - a[1][0])[0], tf = Object.entries(tb.first || {}).sort((a, b) => b[1][0] - a[1][0])[0];
    if (yf && tf && yf[0] !== tf[0]) lines.push(`<li>First item: you usually rush <b>${T.items[yf[0]][0]}</b> (${pct(yf[1][0] / n)}); ${tn} ${champ} players <b>${T.items[tf[0]][0]}</b> (${pct(tf[1][0] / tb.firstN)}, winning ${pct(tf[1][1] / tf[1][0])}).</li>`);
  }
  const bar = (s, cls) => `<span class="sbar"><i class="${cls}" style="width:${Math.round((s || 0) * 100)}%"></i></span>`;
  return `<section class="cv-build"><header class="panel-head"><div><p class="eyebrow">Build · your last ${n} games with it</p><h3>What you build, and what ${tn} ${champ} players build</h3></div><span class="small muted">Items finished with, completed items and boots${tb ? ` · ${tn} and the tiers next to it, ${tb.n.toLocaleString('en-GB')} games, recent patches` : ''}.</span></header>
    ${lines.length ? `<ul class="build-lines">${lines.join('')}</ul>` : ''}
    <div class="build-table"><div class="bt-head"><span>Item</span><span>You</span><span>${tn} ${champ}</span></div>
    ${rows.map((r) => { const flag = tb && r.ts >= 0.25 && r.ys <= 0.1 ? 'miss' : tb && r.ys >= 0.3 && (r.ts ?? 0) <= 0.08 ? 'odd' : ''; return `<div class="bt-row ${flag}"><span class="bt-item">${itemIcon(r.id)}<b>${esc(T.items[r.id]?.[0] || r.id)}</b></span>
      <span class="bt-cell">${bar(r.ys, 'you')}<small>${r.you ? `${pct(r.ys)} · ${r.you[0] >= 3 ? `won ${pct(wr(r.you))}` : `${r.you[0]} game${r.you[0] > 1 ? 's' : ''}`}` : '—'}</small></span>
      <span class="bt-cell">${tb ? `${bar(r.ts, 'them')}<small>${r.them ? `${pct(r.ts)} · won ${pct(wr(r.them))}` : '—'}</small>` : '<small class="muted">no data yet</small>'}</span></div>`; }).join('')}</div>
    <p class="small muted">Win rates with an item describe the games where it was bought; a lost game also changes what people buy. With the production key we'll show it per matchup and by minute.</p></section>`;
}
// ---------- match history ----------
const netText = (net) => `${net >= 0 ? '+' : '−'}${Math.abs(net)} net`;
const lpText = (net) => `≈ ${net >= 0 ? '+' : '−'}${Math.abs(net * LP_PER_GAME)} LP`;
function historyRow(h) {
  const g = signedOf(h);
  return `<a class="match-row trow" href="${g ? `#/train/game/${g.id}` : `#/train/match/${h.id}`}">${icon(h.champ)}<span class="match-pair"><b>${pairLabel(h.pair)}${h.opp ? ` <span class="muted">vs ${champName(h.opp)}</span>` : ''}</b><small>${day(h.start)} · ${Math.round(h.minutes)} min · ${h.k}/${h.d}/${h.a}${g ? ` · <span class="sky-t">${g.kind === 'contest' ? 'prize contest' : 'training contest'}</span>` : ''}</small></span><span class="match-result ${h.win ? 'win' : 'loss'}">${h.win ? 'Win' : 'Loss'}</span><span class="tpos"><b>${(h.cs / h.minutes).toFixed(1)}</b><small>CS/min</small></span><span class="tchips">${metricTags(h, 2, 1)}</span><span class="match-open">›</span></a>`;
}
function matchHistory() {
  const games = rankedHistory().filter((g) => g.start >= S.now - trainDays * DAY).reverse();
  const by = new Map();
  for (const g of games) by.set(g.pair, [...(by.get(g.pair) || []), g]);
  const groups = [...by].map(([pair, gs]) => { const w = gs.filter((g) => g.win).length; return { pair, gs, w, net: 2 * w - gs.length }; }).sort((a, b) => b.gs.length - a.gs.length);
  const totalNet = groups.reduce((s, x) => s + x.net, 0), sel = `${trainRole}|${trainChamp}`;
  const body = trainMode === 'champ'
    ? `<div class="hist-grid">${groups.map((c) => `<button class="hcard ${c.pair === sel ? 'on' : ''}" data-pick="${c.pair}">${icon(splitPair(c.pair).champ)}<span class="hname"><b>${pairLabel(c.pair)}</b><small>${c.gs.length} game${c.gs.length > 1 ? 's' : ''}</small></span><span class="hnet ${c.net > 0 ? 'up' : c.net < 0 ? 'down' : ''}"><b>${netText(c.net)}</b><small>${lpText(c.net)}</small></span><span class="strip mini">${c.gs.slice(0, 12).reverse().map((g) => `<i class="sq ${g.win ? 'w' : 'l'}"></i>`).join('')}</span></button>`).join('')}</div>`
    : `<div class="match-list">${games.slice(0, 40).map(historyRow).join('')}</div>`;
  return `<section class="intel-block hist"><header class="panel-head"><div><p class="eyebrow">Match history · ${trainDays === 30 ? 'last 30 days' : 'last 3 months'}</p><h2>${games.length} games · ${netText(totalNet)} <span class="muted small">${lpText(totalNet)}</span></h2></div><div class="chips">${[['champ', 'By champion'], ['date', 'By date']].map(([k, n]) => `<button class="chip ${trainMode === k ? 'on' : ''}" data-tmode="${k}">${n}</button>`).join('')}</div></header>
  ${body || '<p class="muted">No ranked games in this period.</p>'}
  <p class="small muted">${trainMode === 'champ' ? 'Pick a champion to open it above. ' : ''}LP is an estimate, about ${LP_PER_GAME} a game: Riot keeps no LP per game, so from now on we record it at every check.</p></section>`;
}
function bindTrain() {
  const champs = [...app.querySelectorAll('[data-champ]')].map((b) => b.dataset.champ);
  const tr = $('#ctrack'), on = tr && tr.querySelector('.citem.on');
  if (on) tr.scrollLeft = on.offsetLeft - tr.clientWidth / 2 + on.clientWidth / 2;
  const setChamp = (c, r = null) => { trainChamp = c; trainRole = r; keepTrain(); };
  app.querySelectorAll('[data-champ]').forEach((b) => (b.onclick = () => setChamp(b.dataset.champ)));
  app.querySelectorAll('[data-cstep]').forEach((b) => (b.onclick = () => setChamp(champs[(champs.indexOf(trainChamp) + Number(b.dataset.cstep) + champs.length) % champs.length])));
  app.querySelectorAll('[data-trole]').forEach((b) => (b.onclick = () => { trainRole = b.dataset.trole; keepTrain(); }));
  app.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { const { role, champ } = splitPair(b.dataset.pick); trainChamp = champ; trainRole = role; viewTrain(); $('.pick-bar')?.scrollIntoView({ behavior: 'smooth' }); }));
  app.querySelectorAll('[data-lock]').forEach((b) => (b.onclick = () => lockPair(b.dataset.lock)));
  app.querySelectorAll('[data-tmode]').forEach((b) => (b.onclick = () => { trainMode = b.dataset.tmode; keepTrain(); }));
  app.querySelectorAll('[data-tdays]').forEach((b) => (b.onclick = () => { trainDays = Number(b.dataset.tdays); keepTrain(); }));
  bindCurves();
}
const keepTrain = () => { const y = scrollY; viewTrain(); scrollTo(0, y); };
function lockPair(pair) {
  S.signups.push({ id: uid('S'), kind: 'training', ticket: 0, pair, picks: [], at: S.now, status: 'waiting' });
  save(); toast(`Locked ${pairLabel(pair)}. Play it, then check your games.`);
  keepTrain();
}
function viewPastSignups() {
  const ended = S.signups.filter((s) => s.kind === 'training' && !active(s)).reverse();
  app.innerHTML = `<p><a href="#/train">← Training</a></p><h1>Past sign-ups</h1>${ended.length ? `<div class="list">${ended.map(signupRow).join('')}</div>` : '<p class="muted">None yet.</p>'}`;
}
// ---------- the game report ----------
const CURVE_KINDS = [['gold', 'Gold', (v) => v.toLocaleString('en-GB')], ['cs', 'Farm (CS)', (v) => String(v)], ['dmg', 'Damage to champions', (v) => v.toLocaleString('en-GB')], ['diff', 'Gold gap to your lane opponent', (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString('en-GB')}`]];
const curveCharts = {};
function meanCurve(list, key, min = 3) {
  const out = [];
  for (let i = 0; ; i++) { const xs = list.map((c) => c[key]?.[i]).filter((v) => v != null); if (xs.length < min) break; out.push(Math.round(avg(xs))); }
  return out;
}
function lineChart(id, kind, series, deaths) {
  const [, label, f] = CURVE_KINDS.find((k) => k[0] === kind);
  const w = 340, h = 150, l = 8, r = 8, t = 10, b = 20;
  const n = Math.max(...series.map((s) => s.v.length));
  const vals = series.flatMap((s) => s.v);
  const lo = Math.min(0, ...vals), hiRaw = Math.max(1, ...vals);
  const span = Math.max(1, hiRaw - lo), mag = 10 ** Math.floor(Math.log10(span / 2));
  const stepV = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((k) => k * mag).find((v) => v * 2 >= Math.max(hiRaw, -lo));
  const max = hiRaw > 0 ? stepV * 2 : 0, min = lo < 0 ? -stepV * Math.ceil(-lo / stepV) : 0;
  const x = (i) => l + (i * (w - l - r)) / Math.max(1, n - 1);
  const y = (v) => h - b - ((v - min) / (max - min || 1)) * (h - t - b);
  const at = (vs, m) => { const i = Math.floor(m), fr = m - i; return vs[i] == null ? null : vs[i + 1] == null ? vs[i] : vs[i] + (vs[i + 1] - vs[i]) * fr; };
  curveCharts[id] = { series, n, f, label, l, r };
  const ticks = []; for (let m = 0; m < n; m += 5) ticks.push(m);
  const grid = [...new Set([min, 0, stepV, max].filter((v) => v >= min && v <= max))];
  return `<figure class="curve" data-curve="${id}"><figcaption>${label}</figcaption><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label} per minute">
  ${grid.map((v) => `<line class="${v === 0 ? 'axis' : 'grid'}" x1="${l}" x2="${w - r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>${v ? `<text class="ylab" x="${l}" y="${(y(v) - 3).toFixed(1)}">${f(v)}</text>` : ''}`).join('')}
  ${ticks.map((m) => `<text class="xlab" x="${x(m).toFixed(1)}" y="${h - 6}" text-anchor="middle">${m}'</text>`).join('')}
  <rect class="lane-zone" x="${l}" y="${t}" width="${(x(Math.min(14, n - 1)) - l).toFixed(1)}" height="${h - t - b}"/>
  ${series.slice().reverse().map((s) => `<polyline class="s-${s.cls}" points="${s.v.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`).join('')}
  ${deaths.filter((m) => m < series[0].v.length - 1).map((m) => `<circle class="death" cx="${x(m).toFixed(1)}" cy="${y(at(series[0].v, m)).toFixed(1)}" r="4"><title>Died at ${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}</title></circle>`).join('')}
  <line class="cross" x1="0" x2="0" y1="${t}" y2="${h - b}" hidden/><rect class="hit" x="${l}" y="0" width="${w - l - r}" height="${h - b}" fill="transparent"/></svg><div class="ctip" hidden></div></figure>`;
}
function bindCurves() {
  app.querySelectorAll('[data-curve]').forEach((fig) => {
    const c = curveCharts[fig.dataset.curve], svg = fig.querySelector('svg'), rect = fig.querySelector('.hit'), cross = fig.querySelector('.cross'), tipEl = fig.querySelector('.ctip');
    rect.onmousemove = (ev) => {
      const box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, inner = vb.width - c.l - c.r;
      const px = ((ev.clientX - box.left) / box.width) * vb.width;
      const i = Math.max(0, Math.min(c.n - 1, Math.round(((px - c.l) / inner) * (c.n - 1))));
      const cx = c.l + (i * inner) / Math.max(1, c.n - 1);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.hidden = false;
      tipEl.innerHTML = `<b>${i} min</b>${c.series.map((s) => `<span><i class="k-${s.cls}"></i>${s.name}<b>${s.v[i] == null ? '—' : c.f(s.v[i])}</b></span>`).join('')}`;
      tipEl.hidden = false;
      tipEl.style.left = `${Math.min(box.width - 160, Math.max(0, (cx / vb.width) * box.width + 10))}px`;
    };
    rect.onmouseleave = () => { cross.hidden = true; tipEl.hidden = true; };
  });
}
const itemIcon = (id, cls = 'itm') => { const it = window.TRAINING?.items[id]; return `<img class="${cls}" alt="${esc(it?.[0] || '')}" title="${esc(it?.[0] || '')}" loading="lazy" src="https://ddragon.leagueoflegends.com/cdn/${D.ddragon}/img/item/${id}.png" onerror="this.style.visibility='hidden'">`; };
function teamsBlock(t, h) {
  const side = (k) => { const team = t.teams[k], mine = t.side === (k ? 200 : 100), won = mine ? h.win : !h.win; return `<div class="team ${mine ? 'mine' : ''}"><h4>${mine ? 'Your team' : 'Enemy team'} <span class="${won ? 'w' : 'l'}">${won ? 'Win' : 'Loss'}</span></h4>${team.map(([c, r, k2, d, a, items, me]) => `<div class="tp ${me ? 'me' : ''} ${!mine && c === t.opp ? 'opp' : ''}">${icon(c)}<span class="tp-name"><b>${champName(c)}</b><small>${ROLES[r] || ''}${!mine && c === t.opp ? ' · your lane opponent' : me ? ' · you' : ''}</small></span><span class="tp-kda">${k2}/${d}/${a}</span><span class="tp-items">${items.map((x) => itemIcon(x)).join('')}</span></div>`).join('')}</div>`; };
  const mineFirst = t.side === 100 ? [0, 1] : [1, 0];
  return `<section class="teams">${mineFirst.map(side).join('')}</section>`;
}
function buildBlock(t) {
  const groups = [];
  for (const [m, id] of t.buys) { const last = groups.at(-1); if (last && m - last.m < 0.75) last.ids.push(id); else groups.push({ m, ids: [id] }); }
  const kind = (id) => window.TRAINING.items[id]?.[1];
  const mmss = (m) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`;
  return `<section class="intel-block"><header class="panel-head"><div><p class="eyebrow">Build</p><h2>What you bought, and when</h2></div><span class="small muted">Every back, by minute: completed items and boots large, components small. Hover an icon for its name.</span></header>
  <div class="buildline">${groups.map((g) => `<div class="buy ${g.ids.some((id) => ['item', 'boots'].includes(kind(id))) ? 'key' : ''}"><small>${mmss(g.m)}</small><div>${g.ids.map((id) => itemIcon(id, `itm ${kind(id)}`)).join('')}</div></div>`).join('<i class="arrow">›</i>')}</div></section>`;
}
const AT_MIN = [5, 10, 14];
function matchupLine(pair, opp) {
  const m = window.TRAINING?.matchups[pair]?.[opp];
  const me = champName(splitPair(pair).champ), them = champName(opp);
  if (!m || m[0] < 30) return `<p class="matchup small muted">${me} against ${them}: ${m ? m[0] : 'no'} games in our data, too few to say who is favoured.</p>`;
  const w = Math.round((m[1] / m[0]) * 100);
  const txt = w >= 52 ? `<b>This lane was yours to win.</b> ${me} wins ${w}% of its games against ${them}` : w <= 48 ? `<b>${them} is favoured here.</b> ${me} wins ${w}% against it: what wins this lane comes with the production key` : `<b>An even lane.</b> ${me} wins ${w}% against ${them}`;
  return `<p class="matchup ${w >= 52 ? 'fav' : w <= 48 ? 'unfav' : ''}">${txt} (${m[0].toLocaleString('en-GB')} games, all tiers).</p>`;
}
/** What the production key adds: shown, not built. */
function keyPreview(pair, opp) {
  const them = opp ? champName(opp) : 'your lane opponent';
  return `<section class="preview" aria-label="Coming with Riot's production key"><div><span class="tag">With Riot's production key</span><h3>Next in this report</h3>
  <ul class="small"><li><b>Against ${esc(them)}:</b> what ${tnT()} ${champName(splitPair(pair).champ)} players who win this lane buy, and at which minute, and the damage type that hits you most, with the games behind each line.</li>
  <li><b>AI review:</b> reads this game's timeline and explains in plain words where the lane turned and which deaths cost the most. It only uses the numbers it shows you, and only after the game.</li></ul>
  <p class="small muted">Both need far more timelines than a development key can read.</p></div></section>`;
}
/** A game report: a signed-up game (id) or any ranked game of the account (match id). */
function viewGame(id, matchId) {
  const g = id ? S.games.find((x) => x.id === id) : null;
  const h = g ? historyGame(g) : rankedHistory().find((x) => x.id === matchId);
  if ((id && (!g || !g.analysed)) || (!id && !h)) { app.innerHTML = '<p>Game not found. <a href="#/train">Training</a></p>'; return; }
  const again = () => { if ((location.hash || '').startsWith('#/train/')) render(); };
  const ready = withTraining(again) & withStats(again);
  const tier = P().tier, tn = tierName(tier);
  const base = g || { ...h, kind: 'ranked', note: 'Not signed up: it counts for your history, not for contests.' };
  const pair = base.pair, { champ } = splitPair(pair), cn = champName(champ);
  const c = g?.contestId && findContest(g.contestId);
  const headHtml = `<p><a href="#/train">← Training</a></p><header class="rep-head">${icon(champ, 'champ lg')}<div><p class="eyebrow">${base.kind === 'contest' ? 'Prize contest game' : base.kind === 'training' ? 'Training contest game' : 'Ranked game'} · ${when(base.start)}</p><h1>${pairLabel(pair)} <span class="${base.win ? 'w' : 'l'}">${base.win ? 'Win' : 'Loss'}</span></h1>
  <p class="small muted">${Math.round(base.minutes)} min${h ? ` · ${h.k}/${h.d}/${h.a} · ${h.cs} CS` : ''}${h?.opp ? ` · against ${champName(h.opp)}` : ''} · ${esc(base.note)} ${c ? `<a href="${c.kind === 'imp' ? `#/train/contest/${c.id}` : `#/contest/${c.id}`}">Contest #${num(c.id)} ›</a>` : ''}</p></div></header>`;
  if (!ready) { app.innerHTML = `${headHtml}<p class="muted">${trainLoad === 'failed' || statsLoad === 'failed' ? 'Could not load the game data.' : 'Loading the game…'}</p>`; return; }
  const t = tlOf(h), a = tierAvg(pair);
  const usualGames = rankedHistory().filter((x) => x.pair === pair && x.id !== h.id);
  const usual = usualGames.map(tlOf).filter(Boolean);
  const ums = usualGames.length >= 5 ? Object.fromEntries(groupMetrics(usualGames, false).map((x) => [x.k, x])) : {};
  const gm = Object.entries(gameMetrics(h)).map(([k, x]) => ({ ...MET[k], ...x })).sort((p, q) => q.sev - p.sev);
  const worse = gm.filter((x) => x.sev >= 0.5), better = gm.filter((x) => x.sev <= -0.5);
  const cost = earlyCost(pair);
  const reach = base.reach || Object.fromEntries(Object.keys(base.pos).map((cid) => { let lv = null; for (const l of LEVELS) { const line = lineOf(pair, cid, l, base.win, tier); if (line != null && base.v[cid] >= line) lv = l; } return [cid, lv]; }));
  const rows = Object.keys(base.pos).filter((cid) => offersOf(pair)[cid]).sort((p, q) => base.pos[p] - base.pos[q]);
  const usualPos = usualGames.filter((x) => x.mean != null);
  const usualOfCh = (cid) => { const xs = usualPos.map((x) => x.pos[cid]).filter((v) => v != null); return xs.length >= 5 ? avg(xs) : null; };
  const u = usual.length >= 3 ? usual : null;
  const series = (k) => [
    { name: 'This game', cls: 'game', v: t.cur[k] },
    ...(u ? [{ name: `Your usual (${u.length})`, cls: 'you', v: meanCurve(u.map((x) => x.cur), k) }] : []),
    ...(a?.cur?.[k]?.length ? [{ name: `${tn} ${cn} (${a.n.toLocaleString('en-GB')})`, cls: 'tier', v: a.cur[k] }] : []),
  ];
  const tile = (label, v, ref, f, worseIf) => `<div class="tile ${v == null || ref == null ? '' : worseIf(v, ref) ? 'bad' : 'good'}"><span>${label}</span><b>${v == null ? '—' : f(v)}</b><small>${ref == null ? '' : `${tn} ${f(ref)}`}</small></div>`;
  const mrow = (x) => `<div class="mrow ${x.sev >= 0.5 ? 'bad' : x.sev <= -0.5 ? 'good' : ''}"><span class="mname">${x.sev >= 0.5 ? x.fix : x.name}</span>${gapBar(x.sev, ums[x.k]?.sev ?? null)}<span class="mval"><b>${x.f(x.v)}</b><small>${tn} ${x.f(x.ref)}${ums[x.k] ? ` · you usually ${x.f(ums[x.k].v)}` : ''}</small></span></div>`;
  app.innerHTML = `${headHtml}
  ${h.opp ? matchupLine(pair, h.opp) : ''}
  ${t ? `<section class="rep-top">
    <div class="rep-chart"><h3>Gold gap to ${h.opp ? champName(h.opp) : 'your lane opponent'}, minute by minute</h3><div class="curve-legend">${series('diff').map((s) => `<span><i class="k-${s.cls}"></i>${s.name}</span>`).join('')}<span><i class="k-death"></i>your deaths</span></div>${lineChart(`rep-${h.id}`, 'diff', series('diff'), t.deaths)}</div>
    <div class="tiles">
      ${tile('CS gap at 10', t.at[10]?.[0], a?.at[10]?.[0], (v) => sgn(v), (v, r) => v < r - 4)}
      ${tile('XP gap at 10', t.at[10]?.[2], a?.at[10]?.[2], (v) => sgn(v), (v, r) => v < r - 150)}
      ${tile('Gold gap at 14', t.at[14]?.[1], a?.at[14]?.[1], (v) => sgn(v), (v, r) => v < r - 250)}
      ${tile('Deaths before 14\'', t.d14, a?.d14, (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)), (v, r) => v > r + 0.5)}
      ${t.plates ? tile('Plates lost before 14\'', t.plates[1], a?.plates?.[1], (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1)), (v, r) => v > r + 0.75) : ''}
      <div class="tile"><span>First blood</span><b>${t.fb === 'gave' ? 'You gave it' : t.fb === 'took' ? 'You took part' : 'Elsewhere'}</b><small>${t.k14 ? `you killed ${h.opp ? champName(h.opp) : 'your opponent'} ${t.k14}× before 14'` : ''}</small></div>
    </div>
    ${cost && t.d14 >= 2 ? `<p class="cost"><b>These early deaths cost games.</b> ${tn} ${cn} players with no death before minute 14 win ${cost.none}% of their games; with 2 or more, ${cost.two}%.</p>` : ''}
  </section>` : '<p class="small muted">No timeline for this game.</p>'}
  <section class="rep-rows"><header class="panel-head"><div><p class="eyebrow">Against the average ${tn} ${cn}</p><h2>${worse.length ? `${worse.length} thing${worse.length > 1 ? 's' : ''} went wrong` : 'Nothing clearly went wrong'}${better.length ? ` · ${better.length} went well` : ''}</h2></div><span class="gscale"><small>worse</small><small>${tn}</small><small>better</small></span></header>
    ${gm.map(mrow).join('')}
    ${worse[0] ? `<p class="small tipline"><b>${worse[0].fix}:</b> ${worse[0].tip}</p>` : ''}
    <p class="small muted">The tick is your usual ${pairLabel(pair)} over ${usualGames.length} other games.</p></section>
  ${t ? `<section class="rep-two">${teamsBlock(t, h)}${buildBlock(t)}</section>
  <details class="card tech allch"><summary><h3>More curves: gold, farm, damage</h3></summary><div class="curves">${['gold', 'cs', 'dmg'].map((k) => (t.cur[k]?.length ? lineChart(`rep-${h.id}-${k}`, k, series(k), t.deaths) : '')).join('')}</div></details>` : ''}
  ${g?.results ? `<section class="card goldcard"><h3>Your 3 contest challenges · ${g.total} points</h3><div class="tablewrap"><table class="num"><tr><th>Pick</th><th>You</th><th>Line</th><th>Points</th></tr>${g.results.map((r) => `<tr><td>${CH[r.id].name} <span class="tag ${r.level}">${r.level}</span></td><td>${fmt(r.id, r.value)}</td><td>${fmt(r.id, r.hi)}</td><td>${r.full ? `<b>${r.points}</b> made it` : r.frac > 0 ? `<b>${r.points}</b> (${Math.round(r.frac * 100)}% of the way)` : '0'}</td></tr>`).join('')}</table></div></section>` : ''}
  <details class="card tech allch"><summary><h3>Challenges, for contests <span class="small muted">· position ${Math.round(base.mean)} among ${tn} players · ${rows.length} challenges</span></h3></summary><div class="tablewrap"><table class="num"><tr><th>Challenge</th><th>You</th><th>Tier typical</th><th>Position</th><th>Your usual</th><th>Contest level</th></tr>
  ${rows.map((cid) => { const uv = usualOfCh(cid); return `<tr><td>${CH[cid].name}</td><td><b>${fmt(cid, base.v[cid])}</b></td><td class="muted">${fmt(cid, valueAt(pair, cid, base.win, 0.5, tier))}</td><td><span class="posbar"><i style="width:${base.pos[cid]}%"></i></span> ${base.pos[cid]}</td><td>${uv == null ? '<span class="muted">few games</span>' : Math.round(uv)}</td><td>${reach[cid] ? `<span class="tag ${reach[cid]}">${reach[cid]} ✓</span>` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</table></div>
  <p class="small muted">Contest level: the highest level of each challenge this game would have made in a contest. ${rl('challenges')}${g?.imp ? ` Training contest score: ${signed(g.imp.total)}.` : ''}</p></details>
  ${keyPreview(pair, h.opp)}`;
  bindCurves();
}
/** Where you stand in a training contest, and how much you need to move up. */
function standing(c) {
  const rows = ranked(c), me = rows.find((e) => e.you);
  const above = rows.filter((e) => e.total > me.total).at(-1);
  const of = c.entries.length;
  if (c.state !== 'open') return { me, rows, cls: '', text: `of ${of}` };
  if (!above) return { me, rows, cls: 'up', text: `of ${of} · in the lead` };
  return { me, rows, cls: '', text: `of ${of} · +${above.total - me.total + 1} to move up` };
}
function viewImpContest(id) {
  const c = S.imp[id];
  if (!c) { app.innerHTML = '<p>Contest not found. <a href="#/train">Training</a></p>'; return; }
  const st = standing(c), rows = st.rows;
  app.innerHTML = `<p><a href="#/train">← Training</a></p><div class="hello"><div><p class="eyebrow">Free · 20 training games · any tier · earns points</p><h1>Training contest #${num(c.id)}</h1>
  <p class="sub">${c.state === 'open' ? `Open: ${c.entries.length} of ${SEATS} games, provisional.` : `Finished ${day(c.closedAt)}.`} Ranked by improvement: each game against its tier and against the player's own past games. Riot IDs only. <span class="muted">Demo numbers: the formula is not final.</span></p></div>
  <div class="counter"><b>${c.entries.length}</b><span>of ${SEATS}</span></div></div>
  <div class="standing"><strong>${ord(st.me._place)}</strong><span>${st.text}${c.state === 'open' ? ' <span class="muted">· one game per contest: your next training game enters another one</span>' : ''}</span></div>
  <table class="lb"><tr class="head"><th>#</th><th>Player</th><th style="text-align:right">Improvement</th></tr>
  ${rows.map((e) => `<tr class="${e.you ? 'you' : ''}"><td><span class="place">${e._tie ? '=' : ''}${e._place}</span></td><td><div class="row nowrap">${icon(splitPair(e.pair).champ)}<div><b>${esc(e.name)}</b>${e.you ? ' <span class="tag sky">you</span>' : ''}<div class="small muted">${tierName(e.tier)} · ${pairLabel(e.pair)}</div></div></div></td><td class="pts"><b class="kpi">${signed(e.total)}</b></td></tr>`).join('')}</table>`;
}

// ---------- contest area ----------
const placeOf = (c) => { const me = ranked(c).find((e) => e.you); return me ? me._place : null; };
/** What a player gets back by place, as a share of the ticket: the one prize table of the app. */
const PRIZE_ROWS = [['1st', 2], ['2nd', 1.7], ['3rd', 1.5], ['4th', 1.2], ['5th-12th', 1], ['13th-14th', 0.8], ['15th-20th', 0]];
function prizeTable() {
  return `<div class="tablewrap"><table class="num prizes"><tr><th>Place</th><th>You get back</th>${TICKETS.map((t) => `<th>${euro(t)} ticket</th>`).join('')}</tr>${PRIZE_ROWS.map(([n, x]) => `<tr class="${x > 1 ? 'top' : x === 1 ? 'back' : x > 0 ? 'part' : 'none'}"><td>${n}</td><td><b>${x ? `×${x}` : 'nothing'}</b>${x === 1 ? ', your ticket back' : ''}</td>${TICKETS.map((t) => `<td>${x ? euro2(t * x) : '—'}</td>`).join('')}</tr>`).join('')}</table></div>`;
}
function viewLobby() {
  if (needAccount()) return;
  const open = (t) => Object.values(S.contests).filter((c) => c.state === 'open' && c.ticket === t);
  const prog = Object.values(S.contests).filter((c) => c.state === 'open' && c.entries.some((e) => e.you));
  const waiting = S.signups.filter((s) => s.kind === 'contest' && active(s));
  app.innerHTML = `<div class="route-title contest-title"><p class="eyebrow">The arena</p><h1>Contests</h1><p>Lock your champion, role and three challenges. Your first valid ranked solo game enters the contest.</p></div><div class="walletbar"><div><p class="eyebrow">Wallet</p><div class="big">${euro2(S.balance)}</div><p class="small muted">Play money in this demo. The ticket is taken only when your game enters a contest. ${rl('contests')}</p></div>
  <div class="row"><button class="btn ghost" data-deposit>Deposit</button><button class="btn ghost" data-withdraw>Withdraw</button><a href="#/wallet">Movements →</a></div></div>
  ${S.verified ? '' : '<div class="note"><b>Verify your identity to play for prizes.</b> Everything here is visible with a base account; joining needs a verified one. <a class="btn small" href="#/verify">Verify</a></div>'}
  <h2>Join a contest</h2><div class="grid3">${TICKETS.map((t) => { const o = open(t); const full = o.reduce((m, c) => Math.max(m, c.entries.length), 0); const mine = waiting.filter((s) => s.ticket === t).length;
    return `<div class="card ctype"><div class="row between"><span class="ticket">${euro(t)}</span><span class="tag gold">20 players</span></div>
    <dl class="plist"><dt>1st place</dt><dd>${euro(t * 2)}</dd><dt>Ticket back</dt><dd>places 5-12</dd><dt>Open now</dt><dd>${o.length} · fullest ${full}/20</dd><dt>You</dt><dd>${mine ? `${mine} waiting` : '—'}</dd></dl>
    <a class="btn" href="#/join/${t}">Join</a></div>`; }).join('')}</div>
  <h2>What you get back</h2>${prizeTable()}<p class="small muted">Ties: players on the same points add up the prizes of the places they hold and split them equally. ${rl('contests')}</p>
  <h2>In progress</h2>${prog.length ? `<div class="list">${prog.map((c) => `<a class="item link" href="#/contest/${c.id}"><div class="row nowrap"><div class="grow"><b>#${num(c.id)} · ${euro(c.ticket)}</b><div class="small muted">${c.entries.length}/${SEATS} games</div></div><span class="small muted">you</span><span class="big">${ord(placeOf(c))}</span></div></a>`).join('')}</div>` : '<p class="muted">None of your games is in an open contest.</p>'}
  <h2>Waiting for your game</h2>${waiting.length ? `<div class="list">${waiting.map(signupRow).join('')}</div>` : '<p class="muted">Nothing locked.</p>'}
  ${checkBar()}
  <div class="note warn"><b>Zero tolerance:</b> abuse is punished directly. No smurfs, no shared accounts. Bans are on the person, not the game account. ${rl('fairplay')}</div>
  <section class="steps"><h2>How it works</h2><ol>
  <li><b>Lock</b> a champion, a role and 3 challenges. Nothing is charged. ${rl('signups')}</li>
  <li><b>Play</b> ranked solo when you want. Nothing on screen during the game.</li>
  <li><b>Check:</b> your first game with that champion and role after locking enters a contest; the ticket is taken then. ${rl('signups')}</li>
  <li><b>Leaderboard:</b> 20 games, measured against each player's own tier. The top 4 win up to twice their ticket; places 5 to 12 get it back. ${rl('contests')}</li></ol></section>`;
}
let joinDraft = null;
function viewJoin(ticket) {
  if (needAccount()) return;
  if (!TICKETS.includes(ticket)) { location.hash = '#/contests'; return; }
  if (!S.verified) { S.afterVerify = `#/join/${ticket}`; location.hash = '#/verify'; return; }
  const tier = P().tier;
  if (!joinDraft || joinDraft.ticket !== ticket) joinDraft = newDraft('contest', ticket);
  const d = joinDraft;
  const pp = pairPicker(d);
  const offers = offersOf(d.pair), r = rec();
  const pts = d.picks.reduce((a, x) => a + POINTS[x.level], 0);
  const slot = (i) => { const p = d.picks[i]; return `<div class="slot ${p ? 'full' : ''}"><span class="n">${i + 1}</span>${p ? `<b>${CH[p.id].name}</b> <span class="tag ${p.level}">${p.level}</span> <button class="x" data-rm="${i}" aria-label="Remove">×</button>` : '<span class="muted">empty</span>'}</div>`; };
  app.innerHTML = `<p><a href="#/contests">← Lobby</a></p><div class="hello"><div><p class="eyebrow">${euro(ticket)} contest · 20 players · 1st place ${euro(ticket * 2)}</p><h1>Join</h1></div><div class="stepper"><span class="${d.pair ? 'on' : ''}">① Pair</span><span class="${d.picks.length ? 'on' : ''}">② Challenges</span><span class="${d.picks.length === 3 ? 'on' : ''}">③ Lock</span></div></div>
  <h2>① Pair</h2><section class="card">${pp.html}</section>
  <h2 id="step2">② Three challenges for ${pairLabel(d.pair)}</h2><div class="slots">${[0, 1, 2].map(slot).join('')}</div>
  <p class="small muted">Thresholds for a ${tierName(tier)} player. Under each level: how often your signed-up games made it. ${rl('challenges')}</p>
  <div class="grid chgrid">${D.challenges.filter((c) => offers[c.id]).map((c) => {
    const chosen = d.picks.find((x) => x.id === c.id);
    return `<div class="ch ${chosen ? 'on' : ''}"><div class="row between"><h3>${c.name}</h3><span class="tag">${c.family}</span></div>
    <p class="small muted">${challengeText(d.pair, c.id, chosen ? chosen.level : LEVELS.find((l) => offers[c.id][LEVELS.indexOf(l)] != null), tier)}</p>
    <div class="levels">${LEVELS.map((l, i) => { const t = r[`${d.pair}#${c.id}#${l}`]; const off = offers[c.id][i] == null; return `<button class="lv ${chosen && chosen.level === l ? 'on' : ''}" data-ch="${c.id}" data-lv="${l}" ${off ? 'disabled title="Not offered for this champion and role at this level"' : ''}><b>${l} · ${POINTS[l]}</b>${off ? 'not offered' : `${lineText(d.pair, c.id, l, tier)}<span class="you">${t ? (t.n < 5 ? `you ${pct(t.hits / t.n)} · few data` : `you ${pct(t.hits / t.n)}`) : 'no games yet'}</span>`}</button>`; }).join('')}</div></div>`;
  }).join('')}</div>
  <div class="card lockbar gold"><div class="row between"><div><b>③ ${pairLabel(d.pair)}</b> · ${d.picks.length ? d.picks.map((p) => `${CH[p.id].name} ${LV[p.level]}`).join(' · ') : 'pick 3 challenges'} · up to ${pts} pts
  <div class="small muted">Ticket ${euro(ticket)} · <b>nothing is charged now</b>: the ticket is taken when your game enters a contest. First game with this champion and role after locking · no changes after locking · unlocking takes 1 hour. ${rl('signups')}</div>
  ${ticket > S.balance ? `<div class="small l">Your balance (${euro2(S.balance)}) does not cover this ticket.</div>` : ''}</div>
  <button class="btn" id="lock" ${d.picks.length === 3 && ticket <= S.balance ? '' : 'disabled'}>Lock</button></div></div>`;
  pp.bind(() => viewJoin(ticket));
  const keep = () => { const y = scrollY; viewJoin(ticket); scrollTo(0, y); };
  app.querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => {
    const { ch, lv } = b.dataset;
    const at = d.picks.findIndex((x) => x.id === ch);
    if (at >= 0 && d.picks[at].level === lv) d.picks.splice(at, 1);
    else if (at >= 0) d.picks[at].level = lv;
    else if (d.picks.length < 3) d.picks.push({ id: ch, level: lv });
    else { toast('Three challenges: remove one first.'); return; }
    keep();
  }));
  app.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { d.picks.splice(Number(b.dataset.rm), 1); keep(); }));
  $('#lock').onclick = () => {
    if (d.picks.length !== 3 || ticket > S.balance) return;
    S.signups.push({ id: uid('S'), kind: 'contest', ticket, pair: d.pair, picks: d.picks.map((x) => ({ ...x })), at: S.now, status: 'waiting' });
    joinDraft = null; save(); toast('Locked. Nothing charged: play your game, then check.');
    location.hash = '#/mine';
  };
}
function viewMine(tab) {
  if (needAccount()) return;
  const t = ['progress', 'finished'].includes(tab) ? tab : 'waiting';
  const mineC = Object.values(S.contests).filter((c) => c.entries.some((e) => e.you));
  let body = '';
  if (t === 'waiting') {
    const list = S.signups.filter((s) => s.kind === 'contest');
    const act = list.filter(active), ended = list.filter((s) => !active(s) && s.status !== 'played').slice(-6).reverse();
    body = `${checkBar()}${act.length ? `<div class="list">${act.map(signupRow).join('')}</div>` : '<p class="muted">Nothing locked. <a href="#/contests">Join a contest</a>.</p>'}${ended.length ? `<h2>Ended sign-ups</h2><div class="list">${ended.map(signupRow).join('')}</div>` : ''}`;
  } else if (t === 'progress') {
    const l = mineC.filter((c) => c.state === 'open');
    body = l.length ? `<div class="list">${l.map((c) => { const me = ranked(c).find((e) => e.you); return `<a class="item link" href="#/contest/${c.id}"><div class="row nowrap"><div class="grow"><b>#${num(c.id)} · ${euro(c.ticket)}</b><div class="small muted">${c.entries.length}/${SEATS} games · ${me.total} pts</div></div><span class="big">${ord(me._place)}</span></div></a>`; }).join('')}</div>` : '<p class="muted">No open contest with your games.</p>';
  } else {
    const l = mineC.filter((c) => c.state === 'done').sort((a, b) => b.closedAt - a.closedAt);
    body = l.length ? `<div class="list">${l.map((c) => { const me = c.entries.find((e) => e.you); return `<a class="item link" href="#/contest/${c.id}"><div class="row nowrap"><div class="grow"><b>#${num(c.id)} · ${euro(c.ticket)}</b><div class="small muted">${day(c.closedAt)} · ${me.total} pts</div></div><span class="big">${ord(me.place)}</span><span class="${me.prize ? 'w' : 'muted'}">${me.prize ? `+${euro2(me.prize)}` : 'no prize'}</span></div></a>`; }).join('')}</div>` : '<p class="muted">No finished contest yet.</p>';
  }
  app.innerHTML = `<h1>My contests</h1>${tabs([['#/mine', 'Waiting', 'waiting'], ['#/mine/progress', 'In progress', 'progress'], ['#/mine/finished', 'Finished', 'finished']], t)}${body}`;
}
const openRows = new Set();
function viewContest(id) {
  if (needAccount()) return;
  const c = S.contests[id];
  if (!c) { app.innerHTML = '<p>Contest not found. <a href="#/contests">Lobby</a></p>'; return; }
  const rows = c.state === 'done' ? [...c.entries].sort((a, b) => a.place - b.place || a.at - b.at).map((e) => ({ ...e, _place: e.place, _prize: e.prize, _tie: c.entries.filter((x) => x.place === e.place).length > 1 })) : ranked(c);
  const zoneOf = (p) => (PRIZE_X[p - 1] > 1 ? 'top' : PRIZE_X[p - 1] === 1 ? 'back' : PRIZE_X[p - 1] > 0 ? 'part' : 'none');
  const ZONE = { top: 'Prize', back: 'Ticket back', part: '0.8× ticket', none: 'No prize' };
  const me = rows.find((e) => e.you);
  const above = me && rows.filter((e) => e._place < me._place).pop();
  let lastZone = null;
  const html = rows.map((e, i) => {
    const z = zoneOf(e._place);
    const sep = z !== lastZone ? `<tr class="sep z-${z}"><td colspan="5"><span>${ZONE[z]}</span></td></tr>` : '';
    lastZone = z;
    const k = `${id}:${i}`;
    const res = e.results.map((r) => `<span class="res ${r.full ? 'ok' : r.frac > 0 ? 'part' : 'no'}" title="${CH[r.id].name} ${r.level}: ${fmt(r.id, r.value)} for ${fmt(r.id, r.hi)}">${r.full ? '✓' : r.frac > 0 ? '◐' : '✗'} ${CH[r.id].name} ${LV[r.level]}</span>`).join('');
    return `${sep}<tr class="${e.you ? 'you' : ''} z-${z}" data-row="${k}"><td><span class="place">${e._tie ? '=' : ''}${e._place}</span></td>
    <td><div class="row nowrap">${icon(splitPair(e.pair).champ)}<div><b>${esc(e.name)}</b>${e.you ? ' <span class="tag gold">you</span>' : ''}<div class="small muted">${tierName(e.tier)} · ${pairLabel(e.pair)}</div></div></div></td>
    <td class="chs">${res}</td><td class="pts"><b class="kpi">${e.total}</b></td><td class="prize">${e._prize ? euro2(e._prize) : '<span class="muted">—</span>'}</td></tr>
    ${openRows.has(k) ? `<tr class="detail"><td></td><td colspan="4">${e.results.map((r) => `<div class="small">${CH[r.id].name} <span class="tag ${r.level}">${r.level}</span> ${fmt(r.id, r.value)} for a line of ${fmt(r.id, r.hi)} → <b>${r.points}</b> pts</div>`).join('')}</td></tr>` : ''}`;
  }).join('');
  app.innerHTML = `<p><a href="#/contests">← Lobby</a></p><div class="hello contest-head ${c.state === 'done' ? 'is-finished' : ''}"><div><p class="eyebrow">${euro(c.ticket)} contest · 20 players · 1st place ${euro(c.ticket * 2)} · rules v1 ${rl('changes', '')}</p><h1>Contest #${num(c.id)}</h1>
  <p class="sub">${c.state === 'open' ? `<span class="tag wait">Open ${c.entries.length}/${SEATS}</span> Provisional: it changes as games come in.` : `<span class="tag ok">Finished</span> ${day(c.closedAt)}.${me ? (me.prize ? ` <b>${euro2(me.prize)} credited to your wallet.</b>` : '') + (above ? ` ${Math.round((above.total - me.total) * 10) / 10} points to the place above.` : '') : ''}`} Riot IDs only; each player measured against their own tier. Tap a row for the values.</p></div>
  <div class="counter"><b>${c.entries.length}</b><span>of ${SEATS}</span></div></div>
  <table class="lb"><tr class="head"><th>#</th><th>Player</th><th>Challenges</th><th style="text-align:right">Pts</th><th style="text-align:right">Prize</th></tr>${html}</table>
  <p class="small muted" style="margin-top:8px">✓ made it · ◐ part of the way (window scoring) · ✗ missed. “=” is a tie: tied players share the prizes of the places they hold. ${rl('contests')}</p>`;
  app.querySelectorAll('[data-row]').forEach((tr) => (tr.onclick = () => { const k = tr.dataset.row; openRows.has(k) ? openRows.delete(k) : openRows.add(k); const y = scrollY; viewContest(id); scrollTo(0, y); }));
}
function viewWallet() {
  if (needAccount()) return;
  const KIND = { deposit: 'Deposit', ticket: 'Ticket', prize: 'Prize', refund: 'Refund', withdrawal: 'Withdrawal' };
  app.innerHTML = `<p><a href="#/contests">← Lobby</a></p><p class="eyebrow">Contest area</p><h1>Wallet</h1><p class="sub">Demo: play money. In the real product deposits and withdrawals go through a payment provider; bank details stay with them. ${rl('contests')}</p>
  <div class="walletbar"><div><p class="eyebrow">Balance</p><div class="big">${euro2(S.balance)}</div></div><div class="row"><button class="btn ghost" data-deposit>Deposit</button><button class="btn ghost" data-withdraw>Withdraw</button></div></div>
  <h2>Movements</h2><div class="tablewrap"><table class="num"><tr><th>Date</th><th>Movement</th><th>Contest</th><th style="text-align:right">Amount</th></tr>
  ${S.ledger.slice().sort((a, b) => b.at - a.at).map((l) => `<tr><td>${day(l.at)} ${clock(l.at)}</td><td>${KIND[l.kind]}</td><td>${l.contestId ? `<a href="#/contest/${l.contestId}">#${num(l.contestId)}</a>` : '<span class="muted">—</span>'}</td><td style="text-align:right" class="${l.amount > 0 ? 'w' : ''}">${l.amount > 0 ? '+' : '−'}${euro2(Math.abs(l.amount))}</td></tr>`).join('')}</table></div>`;
}
function viewVerify() {
  if (needAccount()) return;
  const back = S.afterVerify || '#/contests';
  app.innerHTML = `<div class="narrow"><p class="eyebrow">Contest area</p><h1>Verify your identity</h1><p class="sub">Prizes are real money: we need to know who you are. It is also needed to use points. No other player ever sees this data: in contests they see only your Riot ID. ${rl('accounts')}</p>
  ${S.verified ? '<div class="note"><b>Verified.</b> Prize contests are open to you.</div>' : `<form class="card form" id="vf" novalidate>
    <div class="row"><div><label class="fld" for="fn">First name</label><input type="text" id="fn" autocomplete="given-name"></div><div><label class="fld" for="ln">Last name</label><input type="text" id="ln" autocomplete="family-name"></div></div>
    <div><label class="fld" for="dob">Date of birth</label><input type="date" id="dob" autocomplete="bday"></div>
    <div><label class="fld" for="ad">Address</label><input type="text" id="ad" autocomplete="street-address"></div>
    <div class="row"><div><label class="fld" for="ci">City</label><input type="text" id="ci" autocomplete="address-level2"></div><div><label class="fld" for="pc">Postal code</label><input type="text" id="pc" autocomplete="postal-code"></div></div>
    <fieldset class="radio"><legend class="fld">Document</legend><label><input type="radio" name="dt" checked> ID card</label><label><input type="radio" name="dt"> Passport</label><label><input type="radio" name="dt"> Driving licence</label></fieldset>
    <p class="small muted">In the real product an identity provider checks the document; Skybreak keeps only the result. Status: <b>Not verified</b> → Pending → Verified or Rejected.</p>
    <div class="row"><button class="btn" type="submit">Send to verification</button><button class="btn ghost" type="button" id="skip">Skip (demo)</button></div>
  </form>`}</div>`;
  if (S.verified) return;
  const done = () => { S.verified = true; delete S.afterVerify; save(); toast('Verified (demo). Prize contests are open.'); location.hash = back; };
  $('#vf').onsubmit = (e) => { e.preventDefault(); if (!$('#fn').value || !$('#ln').value || !$('#dob').value) { toast('Fill in name and date of birth, or skip.'); return; } done(); };
  $('#skip').onclick = done;
}

// ---------- common ----------
function viewAccount() {
  if (needAccount()) return;
  const f = S.signupForm || {};
  app.innerHTML = `<div class="narrow"><h1>Account</h1>
  <section class="card"><dl class="kv"><dt>Riot ID</dt><dd><b>${esc(P().name)}</b> · ${tierName(P().tier)} · EUW <span class="small muted">· can't be changed</span></dd>
  <dt>Account</dt><dd>${S.verified ? '<span class="tag ok">Verified</span>' : '<span class="tag">Base</span> <a class="btn small" href="#/verify">Verify</a>'}</dd>
  <dt>Email</dt><dd>${esc(f.email || 'demo@skybreak.gg')}</dd><dt>Language</dt><dd>${esc(f.language || 'English')}</dd><dt>News</dt><dd>${f.marketing ? 'Yes' : 'No'}</dd></dl></section>
  <section class="card"><h3>Your data</h3><p class="small muted">We read from Riot your Riot ID, region, rank tier and ranked solo games, through the official API. We keep your sign-ups, the games found and how they were judged, contests, your balance and its movements. No player ratings, no data sold. ${rl('data')}</p>
  <div class="row"><button class="btn ghost" id="dl">Download my data</button><button class="btn ghost" id="del">Delete account</button></div></section>
  <section class="card"><h3>Demo</h3><div class="row"><button class="btn ghost" id="reset">Reset the demo</button><button class="btn ghost" data-signout>Sign out</button></div></section></div>`;
  $('#dl').onclick = () => {
    const blob = new Blob([JSON.stringify({ account: { riotId: P().name, tier: P().tier, region: 'EUW', verified: S.verified, ...S.signupForm }, balanceCents: S.balance, ledger: S.ledger, signups: S.signups, games: S.games }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'skybreak-my-data.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const wipe = () => { S = fresh(); save(); location.hash = '#/signin'; render(); };
  $('#del').onclick = () => { if (confirm('Delete the demo account? In the real product you first withdraw your balance and wait for open contests to finish.')) wipe(); };
  $('#reset').onclick = () => { if (confirm('Reset the demo? Your simulated account, games and contests are deleted.')) wipe(); };
}
function viewSupport() {
  app.innerHTML = `<div class="narrow"><h1>Support</h1><div class="card"><p>Questions about a game, a contest or your account: write to <a href="mailto:david@skybreak.gg">david@skybreak.gg</a>. Include your Riot ID and the contest number.</p><p class="small muted">The rules answer most questions: <a href="#/rules">Rules</a>.</p></div></div>`;
}
/** How the numbers are made: the same words on the entry page and in the rules. */
function dataList() {
  return `<ul><li><b>Where the numbers come from:</b> public ranked solo games on EUW, from Iron to Master, read through Riot's official API after they end: ${D.facts.games.toLocaleString('en-GB')} games, 48,659 of them with the minute-by-minute timeline some challenges need. Nothing is read during a game.</li>
  <li><b>Lines per champion, role and tier:</b> each champion and role has its own lines, and each tier moves them by a correction measured per role. A line sits where the average player of that tier reaches it in about 60% of games (easy), 35% (medium) or 15% (hard).</li>
  <li><b>Tiers with few games are grouped:</b> Iron, Bronze and Silver count together with Gold. A champion and role gets challenges only with enough games: ${D.facts.pairs} today.</li>
  <li><b>Tested before use:</b> lines are fixed on older games and tested on newer ones. A challenge is offered only if it happens as often as declared, whether the game is won or lost, and better players make it happen more often.</li>
  <li><b>Your games never set your lines:</b> they are computed on everyone's games, never on yours.</li></ul>`;
}
const dataProof = () => `On newer games the challenges happened 60.1%, 35.1% and 15.0% of the time. A player's results on odd and even games correlate ${D.facts.follow.toFixed(2)}; winning alone, ${D.facts.wins.toFixed(2)}. Picking the luckiest champion gives at most ×${D.facts.edgeChampion.toFixed(2)}.`;
const RULES = [
  ['what', 'What Skybreak is', `<p>Skybreak judges your ranked solo games against the average player of your tier with the same champion and role. The challenges and their thresholds are the same everywhere in the app. Two areas on the same judgement:</p>
  <ul><li><b>Personal area</b> (free): Intelligence, to study the game, and Training, to fix your own game, with training contests that earn points.</li><li><b>Contest area</b> (prizes): contests of 20 players with a 2, 5 or 10 € ticket; the top 4 win up to twice their ticket, places 5 to 12 get it back.</li></ul><p>Nothing appears on your screen during the game: no overlay, no pop-ups.</p>`],
  ['accounts', 'Accounts', `<div class="tablewrap"><table><tr><th></th><th>Base</th><th>Verified</th></tr><tr><td>What you can do</td><td>the whole personal area; look at the contest lobby and leaderboards</td><td>also: prize contests, the wallet, using points</td></tr><tr><td>What it needs</td><td>email, password, country, the rules accepted, your Riot account linked with Riot Sign On</td><td>also: first and last name, date of birth, address, a document</td></tr></table></div>
  <ul><li>One person has one Skybreak account and one Riot account.</li><li><b>The linked Riot account can never be changed.</b></li><li>Skybreak never asks for your Riot password.</li><li>In contests, other players see only your Riot ID.</li><li>You can download your data and ask for deletion; first withdraw your balance and wait for open contests to finish.</li></ul>`],
  ['personal', 'Personal area', `<ul><li><b>Intelligence:</b> all your ranked solo games, your mains against the players of your tier, and every champion's numbers by role and tier. No rating, and no advice on which challenges to pick in contests.</li>
  <li><b>Training:</b> sign up a game with a champion and role. The game is judged on all the challenges of that champion and role, the same as in contests, and you see your position among the players of your tier.</li>
  <li><b>Training contests:</b> free, 20 training games, any tier. The leaderboard is by improvement: each game against its tier and against the player's own past training games on the same champion, the same role and both together. The number counts only inside the contest. The final formula is still open.</li>
  <li><b>Points</b> will be earned by improving, and will pay for coaching and other services; using them needs a verified account. They never become money. Not in the demo yet.</li></ul>`],
  ['challenges', 'Challenges and scoring', `<ul><li><b>Fair</b> means a challenge happens as often as declared to anyone who plays that champion, in that role, at that tier, whether the game is won or lost. <b>Real</b> means better players make it happen more often.</li>
  <li><b>Levels:</b> easy, the average player makes it in about 6 games out of 10; medium, about 1 in 3; hard, about 1 in 7. Points: ${POINTS.easy}, ${POINTS.medium}, ${POINTS.hard}.</li>
  <li><b>Thresholds</b> are the same for everyone, per champion, role and tier, computed on everyone's public ranked games and never on yours. A challenge is offered to a champion and role only if it passes every test.</li>
  <li><b>Window scoring:</b> reach the line of the chosen level and you get all its points; between the line below and that line, points grow in proportion; below it, nothing. Never more than the chosen level. A contest game scores the sum of its 3 challenges.</li></ul>
  <div class="tablewrap"><table><tr><th>Challenge</th><th>What it measures</th></tr>${D.challenges.map((c) => `<tr><td><b>${c.name}</b><br><span class="small muted">${c.family}</span></td><td class="small">${c.text.replace(/\{x\}|\{xl\}/g, '<i>threshold</i>').replace(/\{y\d0\}/g, '…')}</td></tr>`).join('')}</table></div>`],
  ['method', 'How we treat the data', `${dataList()}<p class="small muted">${dataProof()}</p>`],
  ['signups', 'Sign-ups and checks', `<p>The same for Training and for prize contests.</p><ul><li><b>Lock:</b> the champion, the role and the time, and in contests the 3 challenges with their levels. After locking nothing changes.</li>
  <li><b>The game:</b> your first ranked solo game with exactly that champion and role, started after locking.</li><li><b>Queue:</b> several sign-ups with the same champion and role go in order, the first game to the first sign-up. Each game counts once; you are never twice in the same contest.</li>
  <li><b>Checks:</b> one at the end of the day for everyone, and the Check my games button whenever you want.</li><li><b>At the end of the day, sign-ups not played are removed</b>, in Training and in contests, at no cost.</li>
  <li><b>Unlocking:</b> runs a check at once. If a valid game is found, it counts and the unlock does not apply. If you are in a game, the unlock is refused. Otherwise it takes effect after 1 hour, if no valid game started before the request. In Training too, so a bad game can't be hidden.</li>
  <li><b>Only signed-up games are analysed.</b></li></ul>
  <div class="tablewrap"><table><tr><th>Case</th><th>Rule</th></tr><tr><td>Remakes, games under 10 minutes</td><td>Do not count: the sign-up keeps waiting.</td></tr><tr><td>Dodge</td><td>Not a game: nothing happens.</td></tr><tr><td>Surrender</td><td>Counts normally.</td></tr><tr><td>Normal, flex, ARAM</td><td>Do not count.</td></tr></table></div>`],
  ['contests', 'Prize contests', `<ul><li><b>Wallet:</b> your balance is in euro. A ticket is taken only when your game enters a contest; until then the balance stays yours.</li>
  <li><b>Your balance can never fall short:</b> after a game enters, sign-ups the remaining balance does not cover are removed, at no cost.</li>
  <li><b>20 seats.</b> A contest lasts until 20 games have entered; then final leaderboard and prizes. While open you see the counter and the provisional leaderboard. If it does not fill within the maximum time, it is cancelled and every ticket goes back.</li></ul>
  ${prizeTable()}
  <p><b>Ties:</b> players on the same points add up the prizes of the places they hold and split them equally.</p>`],
  ['fairplay', 'Fair play', '<p>Zero tolerance on contest fair play: abuse is punished directly. No smurfs, no accounts shared or played by someone else. The ban is on the person, not on the game account.</p>'],
  ['data', 'Your data', '<ul><li>Skybreak reads from Riot, through the official API and after you sign in with Riot: Riot ID, region, rank tier and your ranked solo games. Nothing during the game.</li><li>We keep your sign-ups, the games found and how they were judged, contests, your balance and its movements; for verified accounts, the result of the identity check.</li><li>No player ratings, no data sold, nobody\'s personal details shown.</li><li>You can download your data and ask for deletion from your Account.</li></ul>'],
  ['changes', 'When rules change', '<p>The rules are the same for everyone and public before you sign up. They change only with notice; a contest already open finishes under the rules it started with (v1).</p>'],
  ['open', 'Still open', '<ul><li>The maximum time of a contest that does not fill.</li><li>The hour of the end-of-day check and how many manual checks per day.</li><li>The final improvement formula.</li><li>How points are earned and what they pay for.</li></ul>'],
];
function viewRules(sec) {
  app.innerHTML = `<div class="rules"><h1>Rules</h1><p class="sub">The same for everyone, public before you sign up, changed only with notice.</p>
  <nav class="toc" aria-label="Sections">${RULES.map(([id, n], i) => `<a href="#/rules/${id}">${i < RULES.length - 1 ? `${i + 1}. ` : ''}${n}</a>`).join('')}</nav>
  ${RULES.map(([id, n, body], i) => `<section id="r-${id}" class="${id === sec ? 'hl' : ''}"><h2>${i < RULES.length - 1 ? `${i + 1}. ` : ''}${n}</h2>${body}</section>`).join('')}</div>`;
  if (sec && document.getElementById(`r-${sec}`)) requestAnimationFrame(() => document.getElementById(`r-${sec}`).scrollIntoView({ block: 'start' }));
}

// ---------- router ----------
function render() {
  const h = location.hash || '#/';
  const m = h.match(/^#\/(\w+)(?:\/(.*))?/);
  const [route, arg] = m ? [m[1], m[2] || ''] : ['', ''];
  document.body.dataset.route = route || 'public';
  const scene = route === 'home' ? 'dawn'
    : route === 'intel' ? 'morning'
    : route === 'train' ? 'day'
    : route === 'contests' ? 'sunset'
    : route === 'join' ? 'bluehour'
    : route === 'contest' ? (S.contests[arg]?.state === 'done' ? 'afterglow' : 'night')
    : ['mine', 'wallet', 'verify'].includes(route) ? 'twilight'
    : 'predawn';
  document.body.dataset.scene = scene;
  chrome(route);
  if (route === 'signin') viewSignin();
  else if (route === 'signup') viewSignup();
  else if (route === 'link') viewLink();
  else if (route === 'home') viewHome();
  else if (route === 'intel') viewIntel(arg);
  else if (route === 'train') viewTrain(arg);
  else if (route === 'contests') viewLobby();
  else if (route === 'join') viewJoin(Number(arg));
  else if (route === 'mine') viewMine(arg);
  else if (route === 'contest') viewContest(arg);
  else if (route === 'wallet') viewWallet();
  else if (route === 'verify') viewVerify();
  else if (route === 'account') viewAccount();
  else if (route === 'support') viewSupport();
  else if (route === 'rules') viewRules(arg);
  else { location.hash = S.profile == null ? '#/signin' : '#/home'; return; }
  chrome(route);
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-check]');
  if (c && S.profile != null) {
    const n = runCheck({ endOfDay: c.dataset.check === 'day' });
    toast(n ? `Check done: ${n} new game${n > 1 ? 's' : ''} found. See Training › Games.` : 'Check done: no new games.');
    render(); return;
  }
  const u = e.target.closest('[data-unlock]');
  if (u) { const s = S.signups.find((x) => x.id === u.dataset.unlock); if (s && s.status === 'waiting') { unlock(s); render(); } return; }
  if (e.target.closest('[data-signout]')) { S.profile = null; save(); location.hash = '#/signin'; return; }
  if (e.target.closest('[data-deposit]')) { money('deposit', 1000, null); save(); toast('Demo: 10 € of play money added.'); render(); return; }
  if (e.target.closest('[data-withdraw]')) { toast('In the real product withdrawals go to your payment provider.'); return; }
  const me = $('details.me[open]');
  if (me && !e.target.closest('details.me')) me.open = false;
});
addEventListener('hashchange', () => { render(); scrollTo(0, 0); });
load();
render();
