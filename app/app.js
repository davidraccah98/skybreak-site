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
const PRIZE_X = [2, 1.8, 1.6, 1.2, 1.15, 1.11, 1.06, 1.01, 0.96, 0.92, 0.87, 0.82, 0.77, 0.73, 0, 0, 0, 0, 0, 0]; // decided 17 November 2026
const SEATS = 20;
const RESULT_PTS = { win: 100, loss: 50 }; // decided 17 November 2026: a prize contest score is the result plus the 3 challenges
const resultPts = (win) => (win ? RESULT_PTS.win : RESULT_PTS.loss);
const prizeTotal = (win, results) => Math.round((resultPts(win) + results.reduce((a, r) => a + r.points, 0)) * 10) / 10;
const TICKETS = [200, 500, 1000];
const CONTEST_NAME = { 200: 'Rising', 500: 'Pro', 1000: 'Elite' }; // decided 17 November 2026: a name, never "a 2 € contest"
const cName = (t) => `${CONTEST_NAME[t]} contest`;
/** The glossary: one way to say each system, used by every page that explains it, the rules' short form (version 1).
 *  Change a sentence here, in docs/GLOSSARIO.md and in the rulebook together; never write a new variant on a page. */
const TERMS = {
  skybreak: 'Skybreak compares each of your ranked solo queue games with the average player of your rank tier, on the same champion and role.',
  during: 'Nothing appears on your screen during a game: Skybreak reads games only after they end.',
  intel: 'Intelligence shows your ranked games against your rank tier and the numbers of every champion by role and rank tier.',
  training: 'Training analyses every ranked solo game you play, against your usual game and the average player of your rank tier on the same champion and role. Analysis only, for you alone.',
  challenge: 'A challenge is a measurable goal in a game, offered for a champion and role only if it is fair and real.',
  levels: `Easy, medium and hard: the average player of your rank tier makes them in about 6 games out of 10, 1 in 3 and 1 in 7. They are worth ${POINTS.easy}, ${POINTS.medium} and ${POINTS.hard} points.`,
  threshold: 'The threshold of a level is the same for everyone with that champion, role and rank tier, computed on everyone\'s games, never on yours.',
  window: 'Reach the threshold and you get all the points; from the threshold below up to it, the points grow in proportion; below it, none.',
  entry: 'You enter your next game before playing it; after entering, nothing changes.',
  check: 'A check reads your new games from Riot: once a day for everyone, and whenever you press Check my games.',
  unplayed: 'An entry not played by the next day\'s check is cancelled.',
  cancel: 'Cancelling runs a check first: a valid game found still counts; otherwise the entry is cancelled at once.',
  trainingContest: `Training contest: free, ${SEATS} players, each in their own game. Whoever improves most on their usual game with that champion and role ranks highest.`,
  points: 'Progress points are earned only by improving: never bought, never money. They open coaching, merch and team try-outs.',
  prizeContest: `Prize contest: Rising, Pro or Elite, ${SEATS} players, each in their own game.`,
  ownTier: 'Every player is judged on the thresholds of their own rank tier: an Iron and a Diamond compete on equal terms.',
  ticket: 'The ticket is the price to take part, not a sure win. It is taken only when your game enters a contest.',
  score: `The score is the result plus the 3 challenges: ${RESULT_PTS.win} for a win, ${RESULT_PTS.loss} for a loss, plus at most ${POINTS.hard * 3} from the challenges.`,
  prizes: 'Prizes go to the first 14 places; the last 6 win nothing and lose their ticket.',
  included: 'A prize contest game also enters a training contest, so it earns progress points too.',
  riotId: 'In contests other players see only your Riot ID.',
  data: 'Skybreak reads your Riot ID, region, rank tier and ranked solo games through Riot\'s official API, after you sign in with Riot.',
  fairplay: 'Zero tolerance on contest fair play: no smurfs, no shared accounts, no duo; anyone found abusing is banned without notice, and the ban hits the person.',
};
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const START_BALANCE = 2000;
const PAST_SHARE = 0.7; // the account's older games are its history; the newer ones are revealed by checks
const DEMO_PROFILE = 0;
const DEMO_RIOT_ID = 'Er Zebbor#EUW';

// ---------- state ----------
const KEY = 'skybreak-demo-v9'; // v9: prize score is win 100 / loss 50 + challenges; contests have names
let S;
function fresh(keep = {}) {
  return { profile: null, signupForm: null, verified: false, balance: 0, now: Date.now(), lastCheck: Date.now(), cursor: 0, signups: [], games: [], contests: {}, imp: {}, spent: [], ledger: [], seq: 1, area: 'personal', ...keep };
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
  return { name: botName(), tier, pair, at, win, results, total: prizeTotal(win, results), you: false };
}
const impBot = (at) => ({ name: botName(), tier: pick(TIERS), pair: pick(pairKeys), at, total: Math.round((gauss() * 0.8 + 0.05) * 10) / 10, you: false });
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
    // tied players split the prizes of their places; a cent the split leaves over goes to whoever entered first,
    // so a contest always pays out exactly its prizes, never a cent more or less
    const sum = c.ticket ? Math.round(PRIZE_X.slice(i, j + 1).reduce((a, x) => a + x * c.ticket, 0)) : 0, n = j - i + 1, share = Math.floor(sum / n);
    for (let k = i; k <= j; k++) { rows[k]._place = i + 1; rows[k]._tie = j > i; rows[k]._prize = share + (k - i < sum - share * n ? 1 : 0); }
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
  if (!quiet) toast(c.kind === 'imp' ? `Training contest #${num(c.id)} finished: you placed ${ord(me.place)}.` : `${cName(c.ticket)} #${num(c.id)} finished: ${ord(me.place)} place.${me.prize ? ` You won ${euro2(me.prize)}.` : ''}`);
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
  // every training game of the history entered a contest (one game per contest); the last one is still open
  for (const [k, done] of hist.map((g, i) => [i, i < hist.length - 1]).filter(([i]) => i !== past - 5)) { // past - 5 is the prize contest game below
    const g = hist[k];
    if (!g) continue;
    const c = newContest('imp', 0, g.start - 6 * HOUR);
    const n = done ? SEATS - 1 : 11;
    for (let b = 0; b < n; b++) addEntry(c, impBot(c.createdAt + b * 25 * 60e3), true);
    addEntry(c, { name: P().name, tier: P().tier, pair: g.pair, at: g.start, total: Math.round(Math.max(-1.5, Math.min(1.5, g.imp.total / 8)) * 10) / 10, gid: g.id, you: true }, true);
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
    cg.total = prizeTotal(cg.win, cg.results);
    const c = newContest('prize', 200, cg.start - 5 * HOUR);
    for (let b = 0; b < SEATS - 1; b++) c.entries.push(botEntry(c.createdAt + b * 20 * 60e3));
    money('ticket', -200, c.id, cg.start);
    S.now = cg.start + 4 * HOUR;
    addEntry(c, { name: P().name, tier: P().tier, pair: cg.pair, at: cg.start, win: cg.win, results: cg.results, total: cg.total, you: true }, true);
    S.now = Date.now();
    cg.contestId = c.id;
    cg.note = `Contest game: entered Rising contest #${num(c.id)}.`;
  }
  // the other contests running now
  for (const t of TICKETS) for (let k = 0; k < 2; k++) {
    const c = newContest('prize', t, S.now - (k + 1) * 5 * HOUR);
    const n = k === 0 ? 8 + Math.floor(rnd() * 9) : SEATS;
    for (let b = 0; b < n; b++) addEntry(c, botEntry(c.createdAt + b * 20 * 60e3), true);
  }
  seedOpenPrize();
  S.cursor = past;
  save();
  location.hash = '#/home';
}

/** Demo: the 3 challenges a player would lock before this game, from its earlier games on the pair: the ones it
 *  made most often, at the hardest level it makes at least half the time. Only levels with a line in a win and in a loss. */
function seedPicks(g) {
  const tier = P().tier, offers = offersOf(g.pair);
  const prior = S.games.filter((x) => x.analysed && x.pair === g.pair && x.start < g.start);
  const has = (id, l) => lineOf(g.pair, id, l, true, tier) != null && lineOf(g.pair, id, l, false, tier) != null;
  const rate = (id, l) => { const n = prior.filter((x) => x.v[id] != null); return n.length ? n.filter((x) => x.v[id] >= lineOf(x.pair, id, l, x.win, tier)).length / n.length : 0; };
  const ids = Object.keys(offers).filter((id) => g.v[id] != null && LEVELS.some((l) => has(id, l))).sort((x, y) => rate(y, 'easy') - rate(x, 'easy')).slice(0, 3);
  // the surest challenge at hard, the next at medium, the last at easy (the nearest level offered)
  return ids.map((id, i) => { const want = ['hard', 'medium', 'easy'][i], ok = LEVELS.filter((l) => has(id, l)); return { id, level: ok.includes(want) ? want : ok.sort((x, y) => Math.abs(LEVELS.indexOf(x) - LEVELS.indexOf(want)) - Math.abs(LEVELS.indexOf(y) - LEVELS.indexOf(want)))[0] }; });
}
/** Demo: the account's two latest games are also in prize contests still filling up (5 € and 2 €), with the
 *  3 challenges it made most often in its earlier games on that pair: so the contest area shows how a game scores. */
function seedOpenPrize() {
  S.nowSeed = true;
  const tier = P().tier;
  const hist = S.games.filter((g) => g.analysed && /^H/.test(g.id) && g.kind === 'training').sort((a, b) => b.start - a.start);
  for (const [g, ticket] of [[hist[0], 500], [hist[1], 200]]) {
    if (!g || S.balance < ticket) continue;
    g.picks = seedPicks(g);
    if (g.picks.length < 3) continue;
    g.results = g.picks.map((p) => { const value = g.v[p.id]; return { ...p, value, ...score(g.pair, p, value, g.win, tier) }; });
    g.total = prizeTotal(g.win, g.results);
    const { c } = enter('prize', ticket, g.start);
    c.createdAt = Math.min(c.createdAt, g.start - 2 * HOUR);
    money('ticket', -ticket, c.id, g.start);
    addEntry(c, { name: P().name, tier, pair: g.pair, at: g.start, win: g.win, results: g.results, total: g.total, gid: g.id, you: true }, true);
    g.impId = g.contestId; g.kind = 'contest'; g.contestId = c.id;
    g.note = `Contest game: entered ${cName(ticket)} #${num(c.id)}, with its training contest.`;
  }
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
    // The entries this game matches. It enters one training and one prize contest at most: win double, lose double.
    const ss = S.signups.filter((x) => active(x) && (x.pair === f.pair || (x.pair === '*' && x.kind === 'training')) && x.at < f.start && (x.status !== 'unlocking' || f.start < x.unlockAsked) && (x.kind === 'training' || x.ticket <= S.balance)).sort((a, b) => a.at - b.at);
    if (!ss.length) {
      const sameChamp = S.signups.some((x) => active(x) && x.pair !== '*' && splitPair(x.pair).champ === splitPair(f.pair).champ);
      g.note = sameChamp ? 'Same champion, different role: champion and role must match exactly. Your entry keeps waiting.' : 'Not entered in a contest: not analysed.';
      g.v = null; g.analysed = false;
      S.games.push(g);
      continue;
    }
    analyse(g);
    // Entries of the same kind queue up (the oldest takes the game); a training and a prize entry both take it.
    const prizes = ss.filter((x) => x.kind === 'contest').slice(0, 1), trainS = ss.filter((x) => x.kind === 'training').slice(0, 1);
    g.kind = prizes.length ? 'contest' : 'training';
    for (const x of [...trainS, ...prizes]) { x.status = 'played'; x.gameId = g.id; }
    g.signup = (trainS[0] || prizes[0]).id;
    S.games.push(g);
    const notes = [];
    // One training contest for the game: the one it was entered in, or the one every prize contest includes.
    improvement(g);
    {
      const { c, opened } = enter('imp', 0, f.start);
      g.impId = c.id;
      for (const x of trainS) x.contestId = c.id;
      for (const x of prizes) x.impId = c.id;
      notes.push(`${opened ? 'Opened' : 'Entered'} training contest #${num(c.id)}${trainS.length ? '' : ', included with the prize contest'}.`);
      addEntry(c, { name: P().name, tier, pair: f.pair, at: f.start, total: Math.round(Math.max(-1.5, Math.min(1.5, g.imp.total / 8)) * 10) / 10, gid: g.id, you: true });
    }
    if (!prizes.length) g.contestId = g.impId;
    for (const x of prizes) {
      const results = x.picks.map((p) => { const value = f.v[p.id] ?? valueAt(f.pair, p.id, f.win, 0.5, tier); return { ...p, value, ...score(f.pair, p, value, f.win, tier) }; });
      const total = prizeTotal(f.win, results);
      if (!g.results) { g.picks = x.picks; g.results = results; g.total = total; }
      const { c, opened } = enter('prize', x.ticket, f.start);
      money('ticket', -x.ticket, c.id, f.start);
      x.contestId = c.id; g.contestId ||= c.id;
      notes.push(`${opened ? 'Opened' : 'Entered'} ${cName(x.ticket)} #${num(c.id)}: ticket taken from your balance.`);
      addEntry(c, { name: P().name, tier, pair: f.pair, at: f.start, win: f.win, results, total, gid: g.id, you: true });
    }
    g.note = `Judged on all ${g.of} challenges of ${pairLabel(g.pair)}. ${notes.join(' ')}`;
    for (const o of S.signups) if (active(o) && o.kind === 'contest' && o.ticket > S.balance) { o.status = 'removed'; o.note = 'Removed: your balance no longer covers this ticket. Nothing was charged.'; }
  }
  for (const s of S.signups) if (s.status === 'unlocking' && S.now >= s.unlockAt) { s.status = 'unlocked'; s.note = 'Cancelled: no valid game started before your request.'; }
  if (endOfDay) for (const s of S.signups) if (s.status === 'waiting') { s.status = 'removed'; s.note = 'Removed at the end of the day: not played. Nothing was charged.'; }
  botsArrive(elapsed / HOUR);
  S.lastCheck = to;
  save();
  return found.length;
}
function unlock(s) {
  const n = runCheck({ short: true });
  if (s.status === 'played') { toast(`The check found your game${n > 1 ? 's' : ''}: it entered the contest, so the cancellation does not apply.`); return; }
  if (rnd() < 0.15) { s.note = 'Cancellation refused: you were in a game at that moment. Try again when it ends.'; save(); toast('You are in a game right now: cancellation refused.'); return; }
  Object.assign(s, { status: 'unlocked', unlockAsked: S.now, note: `Cancelled at ${clock(S.now)}: the check found no valid game.` });
  save(); toast('Entry cancelled: the check found no valid game.');
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
/** The account's summoner icon with its level under it, the same everywhere (side bar, Home, Account). */
function summoner(p = P(), size = '') {
  if (p.icon == null) return `<span class="sb ${size} none" aria-hidden="true"><b>${esc(p.name[0])}</b></span>`;
  return `<span class="sb ${size}" title="Summoner level ${p.level}"><img alt="" src="https://ddragon.leagueoflegends.com/cdn/${D.ddragon}/img/profileicon/${p.icon}.png"><i>${p.level}</i></span>`;
}
/** The Skybreak logo: the bolt of light through the sky. The same file is assets/logo.svg; the colours never change with the area. */
const LOGO = '<svg class="mark" viewBox="0 0 54 30" aria-hidden="true" focusable="false"><defs><linearGradient id="sb-sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b7ecff"/><stop offset=".48" stop-color="#5cc8ff"/><stop offset="1" stop-color="#3172bf"/></linearGradient></defs><polygon fill="url(#sb-sky)" points="0,22.8 14.04,12 19.44,18 30.78,0 37.8,14.4 54,7.2 38.88,27.6 31.32,18 21.06,30 14.58,21.9"/></svg>';
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
    html = `<a class="logo" href="#/signin">${LOGO}Skybreak</a><nav class="areanav pub">${[['#/rules', 'Rules']].map(link).join('')}</nav>
    <div class="right"><a class="btn small" href="#/signin">Sign in</a></div>`;
  } else {
    const nav = [['#/home', 'Home', 'home'], ['#/intel', 'Intelligence', 'intel'], ['#/train', 'Training', 'train'], ['#/contests', 'Contests', 'contests'], ['#/rules', 'Rules', 'rules']];
    html = `<a class="logo" href="#/home">${LOGO}Skybreak</a>
    <nav class="areanav" aria-label="Main navigation">${nav.map(link).join('')}</nav>
    <div class="right"><button class="btn small" data-check="manual" title="Look for your new games now">Check<span class="hide-s"> my games</span></button>
    ${a === 'contest' ? `<a class="pill" href="#/wallet" title="Your balance">${euro2(S.balance)}</a>` : ''}
    <details class="me"><summary aria-label="Account menu">${summoner(P(), 'sm')}<span class="account-brief"><b>${esc(P().name.split('#')[0])}</b><small>${tierName(P().tier)} · EUW</small></span></summary><div class="menu"><div class="who"><b>${esc(P().name)}</b><span>${tierName(P().tier)} · EUW · ${S.verified ? 'Verified' : 'Base'}</span></div>
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
const statusTag = (s) => ({ waiting: '<span class="tag wait">waiting for your game</span>', unlocking: `<span class="tag wait">cancelling at ${clock(s.unlockAt)}</span>`, played: '<span class="tag ok">played</span>', removed: '<span class="tag no">removed</span>', unlocked: '<span class="tag">cancelled</span>' }[s.status]);
const picksHtml = (picks) => picks.map((p) => `<span class="tag ${p.level}">${CH[p.id].name} ${LV[p.level]}</span>`).join(' ');
const signLabel = (s) => (s.pair === '*' ? 'Your next ranked game' : pairLabel(s.pair));
const signIcon = (s) => (s.pair === '*' ? '<span class="champ any" aria-hidden="true">★</span>' : icon(splitPair(s.pair).champ));
function signupRow(s) {
  const what = s.kind === 'training' ? 'Training contest' : `${cName(s.ticket)} · ${picksHtml(s.picks)}`;
  const act = s.status === 'waiting' ? `<button class="btn ghost small" data-unlock="${s.id}" title="${TERMS.cancel}">Cancel the entry</button>` : s.contestId ? `<a class="btn ghost small" href="${s.kind === 'training' ? `#/contests/t/${s.contestId}` : `#/contest/${s.contestId}`}">Contest #${num(s.contestId)}</a>` : '';
  return `<div class="item"><div class="row nowrap">${signIcon(s)}<div class="grow"><b>${signLabel(s)}</b><div class="small muted">${what} · entered ${clock(s.at)}</div></div>${act}</div>
  <div class="row between" style="margin-top:6px">${statusTag(s)}${s.note ? `<span class="small muted grow" style="text-align:right">${esc(s.note)}</span>` : ''}</div></div>`;
}
function checkBar() {
  return `<div class="checkbar"><div class="small muted">Last check ${when(S.lastCheck)}. ${TERMS.check} ${TERMS.unplayed} ${rl('signups')}</div>
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
  ['#/intel', 'Intelligence', 'area-intel.jpg', TERMS.intel],
  ['#/train', 'Training', 'area-train.jpg', `${TERMS.training} The champions you can improve, the lane phase and build of every game, and how you changed.`],
  ['#/contests', 'Contests', 'area-contests.jpg', `${TERMS.trainingContest} ${TERMS.prizeContest} We don't create custom games, so we don't use the Tournament API.`],
  ['#/rules', 'Rules', 'area-rules.jpg', 'One page, linked from every screen: accounts, scoring, sign-ups, prizes, fair play and how we treat the data.'],
];
/** Enter the demo as Er Zebbor on one screen (keeps the demo state if already in). */
function enterDemo(to) {
  if (S.profile == null) signIn(DEMO_PROFILE);
  location.hash = to;
}
function viewSignin() {
  const back = `<span>${TICKETS.map((t) => `<b>${CONTEST_NAME[t]}</b>`).join(' · ')}</span><span>prizes for the first 14 of 20</span><span><b>the last 6 win nothing and lose their ticket</b></span>`;
  app.innerHTML = `<div class="entry"><div class="entry-head"><p class="eyebrow">Skybreak demo</p><h1>Built with respect for the game</h1>
  <p class="entry-note">I've played League since I was 15, and Skybreak is built out of respect for that game. We followed Riot's developer policies from the first design; if anything here doesn't fit, tell us and we'll change it. <span class="muted">— the founder</span></p>
  <div class="row entry-ways"><button class="btn" data-tour="start">Follow the review path · 6 stops, about 3 minutes</button><button class="btn ghost" data-enter="#/home">${S.profile == null ? 'Explore on your own' : 'Continue on your own'}</button><span class="small muted">Er Zebbor's EUW games and the thresholds are real; other players, time and money are simulated.</span></div></div>
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
// ---------- Home: what is going well, and an invitation to each tool ----------
// Training says what to fix and Intelligence shows the game; the Home only says what goes well, and where to go next.
// Nothing here is repeated elsewhere: one sentence for today, one card per tool, your records, one line of trend.
/** Grades need the timelines and the tier's numbers: without both they would change once those load. */
const gradesReady = () => !!window.TRAINING && !!window.CHAMPSTATS;
const histHref = (h) => { const s = signedOf(h); return s ? `#/train/game/${s.id}` : `#/train/match/${h.id}`; };
const monthKey = (t) => new Date(t).toISOString().slice(0, 7);
const monthName = (k) => new Date(`${k}-15`).toLocaleDateString('en-GB', { month: 'long' });
/** Personal bests over the whole history: they only ever go up. */
function homeRecords(all) {
  const out = [];
  const best = (f, ok = () => true) => all.filter(ok).reduce((b, h) => (b == null || f(h) > f(b) ? h : b), null);
  let run = 0, top = 0, end = null;
  for (const h of all) { run = h.win ? run + 1 : 0; if (run > top) { top = run; end = h; } }
  if (top >= 3) out.push({ h: end, label: 'Longest win streak', value: `${top} wins`, sub: `ended ${day(end.start)}` });
  const long = (h) => h.minutes >= 20;
  const cs = best((h) => h.cs / h.minutes, (h) => long(h) && h.role !== 'UTILITY');
  if (cs) out.push({ h: cs, label: 'Best farm', value: `${(cs.cs / cs.minutes).toFixed(1)} CS/min`, sub: `${champName(cs.champ)} · ${day(cs.start)}` });
  const kda = best((h) => (h.k + h.a) / Math.max(1, h.d), (h) => h.k + h.a >= 8);
  if (kda) out.push({ h: kda, label: 'Cleanest game', value: `${kda.k}/${kda.d}/${kda.a}`, sub: `${champName(kda.champ)} · ${day(kda.start)}` });
  const dmg = best((h) => h.dmg / h.minutes, long);
  if (dmg) out.push({ h: dmg, label: 'Most damage', value: `${Math.round(dmg.dmg / dmg.minutes).toLocaleString('en-GB')} a minute`, sub: `${champName(dmg.champ)} · ${day(dmg.start)}` });
  const kills = best((h) => h.k);
  if (kills && kills.k >= 10) out.push({ h: kills, label: 'Most kills', value: `${kills.k} kills`, sub: `${champName(kills.champ)} · ${day(kills.start)}` });
  if (gradesReady()) {
    const s = [...all].reverse().find((h) => gameGrade(h)?.letter === 'S');
    if (s) out.push({ h: s, label: 'Last S game', value: `${champName(s.champ)}`, sub: `${s.k}/${s.d}/${s.a} · ${day(s.start)}`, grade: 'S' });
  }
  const last = all.at(-1)?.start || 0;
  return out.map((r) => ({ ...r, fresh: last - r.h.start <= 30 * DAY }));
}
/** Real news only, from the last 7 days: a winning streak, a champion in form, a new record. Nothing else gets the box. */
function homeSentences(all, champs) {
  const out = [], week = Date.now() - 7 * DAY;
  const last = all.at(-1);
  if (!last) return out;
  let streak = 0;
  for (let i = all.length - 1; i >= 0 && all[i].win; i--) streak++;
  if (streak >= 3 && last.start >= week) out.push({ c: last.champ, tag: 'Winning streak', say: `${streak} wins in a row.`, more: 'Enter your next game in a training contest while you are on form.', lock: '*', cta: 'Enter your next game' });
  for (const c of champs) {
    const gs = all.filter((g) => g.champ === c).slice(-10);
    if (gs.length === 10 && gs.at(-1).start >= week && gs.filter((g) => g.win).length >= 7) { out.push({ c, tag: 'In form', say: `Your ${champName(c)} won ${gs.filter((g) => g.win).length} of the last 10.`, more: 'See what you do differently with it, game by game.', train: c, cta: `Open your ${champName(c)}` }); break; }
  }
  const rec = homeRecords(all).find((r) => r.h.start >= week && !r.grade); // the last S game is not a record
  if (rec) out.push({ c: rec.h.champ, tag: 'New record', say: `${rec.label}: ${rec.value}.`, more: `${rec.sub}. Open the game and see how it went.`, go: histHref(rec.h), cta: 'Open the game' });
  return out;
}
// ---------- the two contests, said the same way everywhere ----------
// No images of speech: what you do, who you compete with, how you are judged, what you win.
const EXPLAIN = {
  training: `${TERMS.trainingContest} Nobody plays together: each plays their own solo queue game, whenever they want. ${TERMS.points}`,
  prize: `${TERMS.prizeContest} You choose a champion, a role and 3 challenges. ${TERMS.ticket} ${TERMS.ownTier} ${TERMS.score} ${TERMS.prizes} ${TERMS.included}`,
};
const STEPS = `<ol class="esteps"><li><b>1</b>Enter your next game</li><li><b>2</b>Play a solo queue game</li><li><b>3</b>See the ranking</li></ol>`;
/** Where your training contests stand, as one instruction: enter, play, wait for the ranking, or see how it went. */
function trainingState() {
  const waiting = S.signups.filter((x) => x.kind === 'training' && active(x)).sort((a, b) => b.at - a.at)[0];
  const mine = Object.values(S.imp).filter((c) => c.entries.some((e) => e.you)).sort((a, b) => Math.max(...b.entries.filter((e) => e.you).map((e) => e.at)) - Math.max(...a.entries.filter((e) => e.you).map((e) => e.at)));
  const last = mine[0], lastE = last?.entries.filter((e) => e.you).sort((a, b) => b.at - a.at)[0];
  const doneOnce = mine.some((c) => c.state === 'done');
  if (waiting) return { k: 'entered', s: waiting, doneOnce };
  if (last && last.state === 'open') return { k: 'arrived', c: last, e: lastE, place: ranked(last).find((e) => e.you)._place, doneOnce };
  if (last && last.state === 'done') return { k: 'closed', c: last, e: lastE, place: ranked(last).find((e) => e.you)._place, pts: contestPoints(last, lastE).pts, doneOnce };
  return { k: 'none', doneOnce };
}
/** The one thing to do now about training contests, with its button. `pair` enters that champion, '*' any. */
function trainingStep(pair = '*', { compact = false } = {}) {
  const st = trainingState();
  const enterBtn = (label = 'Enter your next game') => `<button class="btn" data-lock="${pair}">${label}</button>`;
  const what = pair === '*' ? 'your next solo queue game' : `your next ${pairLabel(pair)} game`;
  const strip = st.doneOnce || compact ? '' : STEPS;
  if (st.k === 'entered') {
    const s = st.s;
    return `<div class="estate entered">${strip}<p class="e-say"><b>✓ Entered.</b> Now open League of Legends and play ${s.pair === '*' ? 'a solo queue game' : `a solo queue game with ${pairLabel(s.pair)}`}.</p>
      <p class="small">Nothing else to do: after the game we read it from Riot. The entry lasts until tomorrow's check.${s.status === 'unlocking' ? ` Cancelling: it takes effect at ${clock(s.unlockAt)}.` : ''}</p>
      <div class="e-act"><button class="btn small" data-check="manual">I played: check my games</button>${s.status === 'waiting' ? `<button class="btn ghost small" data-unlock="${s.id}" title="${TERMS.cancel}">Cancel the entry</button>` : ''}</div></div>`;
  }
  if (st.k === 'arrived') return `<div class="estate arrived">${strip}<p class="e-say"><b>Your game is in training contest #${num(st.c.id)}:</b> you are ${ord(st.place)} of ${st.c.entries.length} games in.</p>
      <p class="small">The ranking closes at ${SEATS} games. You can already enter your next game.</p><div class="e-act">${enterBtn()}<a class="btn ghost small" href="#/contests/t/${st.c.id}">See the ranking</a></div></div>`;
  if (st.k === 'closed') return `<div class="estate closed">${strip}<p class="e-say"><b>You finished ${ord(st.place)} of ${SEATS}:</b> ${st.pts >= 0 ? '+' : '−'}${Math.abs(st.pts).toFixed(1)} progress points.</p>
      <p class="small"><a href="#/contests/t/${st.c.id}">See the ranking of contest #${num(st.c.id)}</a></p><div class="e-act">${enterBtn()}</div></div>`;
  return `<div class="estate none">${strip}<p class="e-say"><b>Enter ${what} in a training contest.</b></p>${compact ? '' : `<p class="small">${EXPLAIN.training}</p>`}<div class="e-act">${enterBtn()}</div></div>`;
}
/** The progress bar, small: what you have and what the next reward is. */
function progressMini() {
  const { bal } = progressLedger();
  const next = REWARDS.find((r) => r[2] > bal);
  const goal = next ? next[2] : REWARDS.at(-1)[2];
  return `<a class="pmini" href="#/train" title="Progress points are earned in training contests, never bought"><span class="pm-top"><span>Your progress</span><b>${bal.toFixed(1)}</b><small>/ ${goal}</small></span><span class="pm-bar"><i style="width:${Math.min(100, (bal / goal) * 100)}%"></i></span><small>${next ? `${round1(goal - bal)} more for: ${next[1].toLowerCase()}` : `Enough for: ${REWARDS.at(-1)[1].toLowerCase()}`}</small></a>`;
}
// ---------- Home: your next game, the moment before you queue ----------
// Three champions in form, and for the one you pick: one thing to keep doing, the lane you will likely meet,
// what the last patch changed for them, then the two ways in: a training contest, or a prize contest.
/** Your three champions in the best form: the last 10 games with each, among the 10 you play most and still play. */
function formChamps(all) {
  const { champs } = sliderChamps();
  const lastAt = all.at(-1)?.start || 0;
  return champs.map((c) => {
    const gs = all.filter((g) => g.champ === c);
    const last10 = gs.slice(-10), roles = {};
    for (const g of gs) roles[g.role] = (roles[g.role] || 0) + 1;
    const role = Object.keys(roles).sort((a, b) => roles[b] - roles[a])[0];
    return { c, role, pair: `${role}|${c}`, gs, last10, w: last10.filter((g) => g.win).length, recent: lastAt - gs.at(-1).start <= 90 * DAY };
  }).filter((x) => x.recent && x.last10.length >= 5).sort((a, b) => b.w / b.last10.length - a.w / a.last10.length || b.gs.length - a.gs.length).slice(0, 3);
}
/** What you do better than your tier in your last 10 games with this champion, best first (none until the data is in). */
function strengthsOf(f) {
  if (!gradesReady()) return null;
  const sums = {};
  for (const h of f.last10) for (const [k, x] of Object.entries(gameMetrics(h))) { const s = (sums[k] ||= { v: [], ref: [], sev: [] }); s.v.push(x.v); s.ref.push(x.ref); s.sev.push(x.sev); }
  return Object.entries(sums).filter(([, s]) => s.sev.length >= 5).map(([k, s]) => ({ m: MET[k], v: avg(s.v), ref: avg(s.ref), sev: avg(s.sev) })).filter((x) => x.sev < -0.15).sort((a, b) => a.sev - b.sev).slice(0, 3);
}
/** Your champions in form, each with what you do well: a door to Training on that champion. */
function nextGameBlock(all) {
  const forms = formChamps(all);
  if (!forms.length) return '';
  const tn = tnT();
  return `<section class="nextgame" aria-label="Your best champions lately">
    <header class="ng-head"><div><p class="eyebrow">Your best champions lately</p><h2>Want to keep winning? Play one of these.</h2></div><p class="ng-sub">You are awesome with them: here is what you do better than ${tn} players.</p></header>
    <div class="ng-picks">${forms.map((x) => { const st = strengthsOf(x); return `<a class="ng-card" href="#/train" data-trainchamp="${x.c}" title="Open your ${esc(champName(x.c))} in Training">
      <span class="ng-art" style="--art:url('https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${x.c}_0.jpg')"><span class="ng-name"><b>${champName(x.c)}</b><small>${ROLES[x.role]}</small></span></span>
      <span class="ng-foot"><span class="ng-form"><b>${x.w}/${x.last10.length}</b><small>last games won</small></span><span class="ng-strip">${x.last10.map((g) => `<i class="${g.win ? 'w' : 'l'}"></i>`).join('')}</span>
        <span class="ng-tags">${st == null ? '<span class="ng-tag wait">…</span>' : st.length ? st.map((s) => `<span class="ng-tag" title="${esc(s.m.name)}: ${s.m.f(s.v)} · ${tn} ${s.m.f(s.ref)}">${s.m.good}</span>`).join('') : '<span class="ng-tag">In form</span>'}</span>
        <span class="ng-open">Open in Training →</span></span></a>`; }).join('')}</div>
  </section>`;
}
/** The contests, as the Home shows them (a door to the area) or as the Contests area shows them (everything, once). */
function contestsBlock(mode = 'area') {
  const st = trainingState(), { bal } = progressLedger();
  const open = Object.values(S.contests).filter((c) => c.state === 'open');
  const nextR = REWARDS.find((r) => r[2] > bal);
  const paid = PRIZE_X.filter((x) => x > 0).length, nothing = SEATS - paid, pool = PRIZE_X.reduce((a, x) => a + x, 0);
  const title = mode === 'home'
    ? `<div class="hc-title"><p class="eyebrow">Contests · solo queue</p><h2>Prove yourself.<br><span>Show your value.</span></h2>
      <p>20 players, each in their own solo queue game. One entry, two ways to win.</p></div>`
    : `<div class="route-title"><p class="eyebrow">Prove yourself · show your value</p><h1>Contests</h1>
      <p>20 players, each in their own solo queue game. One entry, two ways to win.</p></div>`;
  if (mode === 'home') return `<section class="hcontests home" aria-label="Contests">
    <header class="hc-hero">${title}
      <div class="hc-doors">
        <a class="hc-door free" href="#/contests"><span>Training contest · free</span><b>Beat your own usual game</b><small>${TERMS.points}</small><i>See how it works →</i></a>
        <a class="hc-door prize" href="#/contests"><span>Prize contest</span><b>Play for a prize against 19 players</b><small>Choose 3 challenges. Three contests: Rising, Pro and Elite.</small><i>See how it works →</i></a>
      </div></header></section>`;
  const tile = (cls, top, big, small, href) => `<${href ? `a href="${href}"` : 'div'} class="hc-tile ${cls}"><span>${top}</span><b>${big}</b><small>${small}</small></${href ? 'a' : 'div'}>`;
  const card = (cls, name, price, pitch, rules, tiles, honest, foot) => `<article class="hc-card ${cls}">
      <header><span class="hc-name">${name}</span>${price ? `<span class="hc-price">${price}</span>` : ''}</header>
      <h3 class="hc-pitch">${pitch}</h3>
      <ul class="hc-rules">${rules.map((r) => `<li>${r}</li>`).join('')}</ul>
      <div class="hc-tiles">${tiles.join('')}</div>
      <p class="hc-honest">${honest}</p>
      <div class="hc-foot">${foot}</div></article>`;
  // the training card does what it says: enter, or check once entered
  const trainNow = st.k === 'entered' ? '<b>✓ Your next game is entered.</b> Now play a solo queue game.'
    : st.k === 'arrived' ? `Your last game: <b>${ord(st.place)}</b> of ${st.c.entries.length} in training contest #${num(st.c.id)}.`
    : st.k === 'closed' ? `Last training contest: <b>${ord(st.place)}</b> of ${SEATS}, ${st.pts >= 0 ? '+' : '−'}${Math.abs(st.pts).toFixed(1)} points.` : 'Free, with any champion.';
  const trainAct = st.k === 'entered' ? '<button class="btn" data-check="manual">I played: check my games</button>' : '<button class="btn" data-lock="*">Enter your next game</button>';
  const trainFoot = `<p class="hc-now">${trainNow} You have <b>${bal.toFixed(1)}</b> points${nextR ? `, ${round1(nextR[2] - bal)} more for ${REWARD_SHORT[nextR[0]].toLowerCase()}` : ''}.</p><div class="hc-acts">${trainAct}<a class="hc-more" href="#/contests/training">Your progress and contests →</a></div>`;
  const prizeFoot = `<p class="hc-now">${open.length} contests open now · <a href="#/wallet">${euro2(S.balance)} in your wallet</a>${S.verified ? '' : ' · <a href="#/verify">prizes need a verified account</a>'}.</p><div class="hc-acts"><a class="btn gold" href="#/join/${TICKETS[0]}">Choose a ticket</a><a class="hc-more" href="#/mine">Your prize contests →</a></div>`;
  return `<section class="hcontests" aria-label="Contests">
    <header class="hc-hero">${title}
      <ol class="hc-how">
        <li><b>1</b><div><strong>Enter your next game</strong><span>${TERMS.entry}</span></div></li>
        <li><b>2</b><div><strong>Play a solo queue game</strong><span>As usual, whenever you want. Nobody plays together: each of the 20 plays their own game.</span></div></li>
        <li><b>3</b><div><strong>See the ranking</strong><span>After the game we read it from Riot. It joins a contest of 20, and the ranking compares the 20 games.</span></div></li>
      </ol></header>
    <div class="hc-two">
      ${card('free', 'Training contest', 'Free', 'Beat your own usual game.', ['Your next game counts, with any champion.', TERMS.trainingContest],
        REWARDS.filter((r) => ['review', 'coaching', 'tryout'].includes(r[0])).map(([id, , cost]) => tile(bal >= cost ? 'ok' : '', `${cost} points`, REWARD_SHORT[id], { review: 'on one of your games', coaching: 'one hour, one to one', tryout: 'for a Skybreak team' }[id])),
        TERMS.points, trainFoot)}
      ${card('prize', 'Prize contest', '', 'Play for a prize against 19 players.', ['Choose a champion, a role and 3 challenges, and try to score as many points as you can.', TERMS.ownTier],
        TICKETS.map((t) => tile('', CONTEST_NAME[t], euro(t * pool), `in prizes · ticket ${euro(t)}`, `#/join/${t}`)),
        `<b class="hc-warn">You can lose your ticket. In every contest the last ${nothing} of the 20 win nothing.</b> The ticket lets you take part and compete for the prizes of the first ${SEATS - nothing} places: it is not a sure win. It includes a training contest, so you also earn progress points. <a href="#/rules/contests">The prizes, place by place →</a>`, prizeFoot)}
    </div>
    ${myContestsNow()}
    <ul class="hc-promise">
      <li><b>Solo queue only</b><span>Normal, flex and ARAM games never count.</span></li>
      <li><b>Nothing to gain by losing</b><span>Every challenge is set to be as reachable in a win as in a loss: no challenge rewards you for throwing a game.</span></li>
      <li><b>Nothing on screen</b><span>No overlay and no alerts during the game. You just play.</span></li>
      <li><b>Zero tolerance</b><span>${TERMS.fairplay}</span></li>
    </ul>
  </section>`;
}
/** Everything you have going now, both kinds in one list: entries waiting for a game, contests filling up. */
function myContestsNow() {
  const waiting = S.signups.filter(active).sort((a, b) => b.at - a.at);
  const mineC = [...Object.values(S.imp), ...Object.values(S.contests)].filter((c) => c.entries.some((e) => e.you));
  const myAt = (c) => Math.max(...c.entries.filter((e) => e.you).map((e) => e.at));
  // finished: the last 2 prize contests and the last training contest, by when your game was played
  const doneOf = (k, n) => mineC.filter((c) => c.state === 'done' && (c.kind === 'imp') === k).sort((x, y) => myAt(y) - myAt(x)).slice(0, n);
  const openC = mineC.filter((c) => c.state === 'open'), doneC = [...doneOf(false, 2), ...doneOf(true, 1)].sort((x, y) => myAt(y) - myAt(x));
  const rows = [
    ...waiting.map((s) => `<div class="cn-row"><span class="cn-kind ${s.kind === 'training' ? 'free' : 'prize'}">${s.kind === 'training' ? 'Training' : CONTEST_NAME[s.ticket]}</span><span class="cn-what"><b>${signLabel(s)}</b><small>${s.status === 'unlocking' ? `cancelling at ${clock(s.unlockAt)}` : `entered ${clock(s.at)} · waiting for your game`}</small></span>${s.status === 'waiting' ? `<button class="btn ghost small" data-unlock="${s.id}" title="${TERMS.cancel}">Cancel</button>` : ''}</div>`),
    ...openC.sort((x, y) => (x.kind === 'imp') - (y.kind === 'imp')).map(nowCard),
    ...(doneC.length ? [`<p class="cn-sep">Finished</p>`, ...doneC.map(nowCard)] : []),
  ];
  return `<section class="cnow" aria-label="Your contests"><header><h3>Your contests</h3><div class="cn-check"><span class="small muted">Last check ${when(S.lastCheck)}</span><button class="btn small" data-check="manual">Check my games</button><button class="btn ghost small" data-check="day" title="Demo: the daily check removes entries not played">Skip to the end of the day</button></div></header>
    ${rows.length ? `<div class="cn-list">${rows.join('')}</div>` : '<p class="small muted">Nothing going on: enter your next game in one of the two contests.</p>'}${doneC.length ? '<p class="cn-all"><a href="#/mine/finished">All your prize contests →</a><a href="#/contests/training">All your training contests →</a></p>' : ''}</section>`;
}
/** The game behind one of your entries: the signed-up game and the ranked game Riot keeps (opponent, KDA). */
function entryGame(e) {
  const g = S.games.find((x) => (e.gid && x.id === e.gid) || (!e.gid && x.start === e.at && x.pair === e.pair));
  return { g, h: g ? historyGame(g) : null };
}
const gameLine = (e, g, h) => { const { champ } = splitPair(e.pair), win = h ? h.win : e.win, href = g ? `#/train/game/${g.id}` : h ? `#/train/match/${h.id}` : null;
  const inner = `${icon(champ)}<span class="cn-who"><b>${pairLabel(e.pair)}</b>${h?.opp ? `<span class="cn-vs">vs</span>${icon(h.opp, 'champ sm')}<b>${champName(h.opp)}</b>` : ''}</span>${win != null ? `<span class="cn-res ${win ? 'w' : 'l'}">${win ? 'Win' : 'Loss'}</span>` : ''}${h ? `<span class="cn-kda">${h.k}/${h.d}/${h.a}</span>` : ''}<span class="cn-when">${h ? `${Math.round(h.minutes)} min · ` : ''}${day(e.at)}</span>${href ? '<i>Training →</i>' : ''}`;
  return href ? `<a class="cn-game" href="${href}" title="Open this game in Training">${inner}</a>` : `<div class="cn-game">${inner}</div>`; };
/** The provisional ranking, short: the first 3, then you with the players around you. */
function miniRanking(c, rows, val) {
  const me = rows.findIndex((e) => e.you), show = [...new Set([0, 1, 2, me - 1, me, me + 1])].filter((i) => i >= 0 && i < rows.length).sort((a, b) => a - b);
  let last = -1; const out = [];
  for (const i of show) {
    if (i > last + 1) out.push('<li class="gap">…</li>');
    last = i; const e = rows[i];
    out.push(`<li class="${e.you ? 'you' : ''}"><span class="p">${e._tie ? '=' : ''}${e._place}</span>${icon(splitPair(e.pair).champ, 'champ sm')}<span class="n">${e.you ? 'You' : esc(e.name)}</span><b>${val(e)}</b></li>`);
  }
  const more = rows.length - 1 - last;
  const open = c.state === 'open';
  return `<div class="cn-rank"><p>${open ? `Provisional ranking · ${c.entries.length} of ${SEATS} in` : 'Final ranking'}</p><ol>${out.join('')}</ol>${open ? `<small>${more > 0 ? `${more} more below · ` : ''}${SEATS - c.entries.length} places still to fill</small>` : more > 0 ? `<small>${more} more below</small>` : ''}</div>`;
}
/** One open contest you are in: your game (it opens in Training), how its score is made, and the provisional ranking.
 *  Training: improvement against the contest average, and the numbers behind it. Prize: result + 3 challenges. */
function nowCard(c) {
  const rows = ranked(c), me = rows.find((e) => e.you), train = c.kind === 'imp', { g, h } = entryGame(me);
  const href = train ? `#/contests/t/${c.id}` : `#/contest/${c.id}`;
  const done = c.state === 'done';
  const head = (right) => `<header class="cn-head ${done ? 'done' : ''}"><span class="cn-kind ${train ? 'free' : 'prize'}">${train ? 'Training' : 'Prize'}</span><a href="${href}"><b>${train ? 'Training contest' : cName(c.ticket)} #${num(c.id)}</b></a><span class="cn-place"><b>${me._tie ? '=' : ''}${ord(me._place)} place</b>${right}</span></header>`;
  const it = (label, value, cls = '', title = '') => `<span class="cn-it ${cls}"${title ? ` title="${title}"` : ''}><small>${label}</small><b>${value}</b></span>`;
  if (train) {
    const cp = contestPoints(c, me), ip = h ? improvementParts(h) : { parts: [] };
    const up = ip.parts.filter((x) => x.z >= 0.3).slice(0, 2), down = ip.parts.filter((x) => x.z <= -0.3).slice(-1);
    const chip = (x, cls) => `<span class="cn-part ${cls}">${cls === 'up' ? '▲' : '▼'} ${x.m.name} <b>${x.m.f(x.v)}</b><small>usual ${x.m.f(x.ref)}</small></span>`;
    return `<article class="cn-card free">${head(done ? `<small>${signed(cp.pts)} points</small>` : '<small>so far</small>')}<div class="cn-body"><div class="cn-main">${gameLine(me, g, h)}
      <div class="cn-sum">${it('Your improvement', signed(me.total), me.total >= 0 ? 'up' : 'down')}<span class="op">vs</span>${it('Contest average', signed(cp.field))}<span class="op">→</span>${it('Points', signed(cp.pts), `tot ${cp.pts >= 0 ? 'up' : 'down'}`)}</div>
      ${up.length || down.length ? `<div class="cn-parts">${up.map((x) => chip(x, 'up')).join('')}${down.map((x) => chip(x, 'down')).join('')}${ip.by ? `<small>against your usual ${ip.by}</small>` : ''}</div>` : ''}</div>
      ${miniRanking(c, rows, (e) => signed(e.total))}</div></article>`;
  }
  const mark = (r) => (r.full ? '✓' : r.frac > 0 ? '◐' : '✗');
  const ch = me.results.map((r) => it(`${mark(r)} ${CH[r.id].name} ${LV[r.level]}`, `${r.points}<i>/${POINTS[r.level]}</i>`, r.full ? 'ok' : r.frac > 0 ? 'part' : 'no', `you ${fmt(r.id, r.value)} · needed ${CH[r.id].format === 'share-max' ? 'at most ' : ''}${fmt(r.id, r.hi)}`)).join('<span class="op">+</span>');
  const vals = me.results.map((r) => `${CH[r.id].name} ${fmt(r.id, r.value)} (needed ${CH[r.id].format === 'share-max' ? 'at most ' : ''}${fmt(r.id, r.hi)})`).join(' · ');
  return `<article class="cn-card prize">${head(done ? `<small>${me._prize ? `You won <b class="won">${euro2(me._prize)}</b>` : 'No prize this time'}</small>` : '<small>so far</small>')}<div class="cn-body"><div class="cn-main">${gameLine(me, g, h)}
    <div class="cn-sum">${it(me.win ? 'Win' : 'Loss', resultPts(me.win), 'res')}<span class="op">+</span>${ch}<span class="op">=</span>${it('Total', me.total, 'tot')}</div>
    <p class="cn-vals">${vals}</p></div>
    ${miniRanking(c, rows, (e) => e.total)}</div></article>`;
}
/** #/contests/training: the training contest on its own, with the progress, the rewards and every contest you played. */
function viewTrainingArea() {
  const again = () => { if ((location.hash || '') === '#/contests/training') { const y = scrollY; viewTrainingArea(); scrollTo(0, y); } };
  withTraining(again); withStats(again); syncContests();
  app.innerHTML = `<p class="back"><a href="#/contests">← Contests</a></p>
  <header class="route-title"><p class="eyebrow">Free · 20 players</p><h1>Training contest</h1><p>Your progress, the rewards it opens, and every training contest you played.</p></header>
  ${progressPanel()}
  <section class="carea"><h2>Your training contests</h2>${myTrainingContests()}${S.signups.some((x) => x.kind === 'training' && !active(x)) ? '<p class="small"><a href="#/contests/signups">Past entries →</a></p>' : ''}</section>`;
}
/** Your training contests, newest first: where each one stands and what it gave you. */
function myTrainingContests() {
  const last = (c) => Math.max(...c.entries.filter((e) => e.you).map((e) => e.at));
  const mine = Object.values(S.imp).filter((c) => c.entries.some((e) => e.you)).sort((a, b) => last(b) - last(a)).slice(0, 8);
  if (!mine.length) return '<p class="muted">No training contest yet: enter your next game.</p>';
  return `<div class="list">${mine.map((c) => { const me = ranked(c).find((e) => e.you), pts = contestPoints(c, c.entries.filter((e) => e.you).sort((a, b) => b.at - a.at)[0]).pts;
    return `<a class="item link" href="#/contests/t/${c.id}"><div class="row nowrap">${icon(splitPair(me.pair).champ)}<div class="grow"><b>Training contest #${num(c.id)}</b><div class="small muted">${c.state === 'open' ? `open · ${c.entries.length} of ${SEATS} games` : `finished ${day(c.closedAt)}`}</div></div><span class="small muted">you</span><span class="big">${ord(me._place)}</span><span class="tc-pts ${pts > 0 ? 'up' : pts < 0 ? 'down' : ''}">${pts >= 0 ? '+' : '−'}${Math.abs(pts).toFixed(1)}</span></div></a>`; }).join('')}</div>`;
}
const trainNudge = () => contestNudge('Put your improvement to the test', `Enter your next game in a free training contest. ${TERMS.trainingContest}`);
/** A button, in Training and Intelligence, that sends to the contests. */
const contestNudge = (title, text, to = '#/contests/training', cta = 'Contests →') => `<a class="cnudge" href="${to}"><span class="cn-art" aria-hidden="true"></span><span class="cn-text"><b>${title}</b><small>${text}</small></span><i>${cta}</i></a>`;
function viewHome() {
  if (needAccount()) return;
  const p = P(), all = rankedHistory();
  const again = () => { if ((location.hash || '#/home').startsWith('#/home')) viewHome(); };
  withTraining(again); withStats(again);
  syncContests(); // the same scores Training shows, once the timelines are in
  const { champs } = sliderChamps();
  const sentences = homeSentences(all, champs);
  const today = sentences.length ? sentences[Math.floor(Date.now() / DAY) % sentences.length] : null;
  const avatar = summoner(p, 'lg');
  app.innerHTML = `<section class="player-sky home-sky"><div class="player-id">${avatar}<div><p class="eyebrow">Welcome back</p><h1>${esc(p.name)}</h1><p class="player-meta">EUW · ${p.role} main</p></div></div>
    ${today ? `<div class="home-today" style="--splash:url('https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${today.c}_0.jpg')"><p class="eyebrow">${today.tag}</p><strong>${today.say}</strong><p>${today.more}</p>${today.train ? `<a class="btn" href="#/train" data-trainchamp="${today.train}">${today.cta}</a>` : today.lock ? `<button class="btn" data-lock="${today.lock}">${today.cta}</button>` : `<a class="btn" href="${today.go}">${today.cta}</a>`}</div>` : ''}
    <div class="sky-fracture" aria-hidden="true"></div></section>
  ${nextGameBlock(all)}
  ${contestsBlock('home')}
  <a class="hintel" href="#/intel"><span><p class="eyebrow">Intelligence</p><b>Every champion, every matchup, six years of patches.</b><small>Builds, runes, counters and tier lists for every league, from real ranked games: find it all in Intelligence.</small></span><i>Open Intelligence →</i></a>
  `;
  app.querySelectorAll('[data-trainchamp]').forEach((a) => (a.onclick = () => { trainChamp = a.dataset.trainchamp; trainRole = null; }));
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
// Intelligence is the game, not you: pick a champion, a role, an opponent and a tier group, and see everything the
// lab's matches and timelines say (app/intel/, built by apps/lab/src/intel-data.ts). Nothing personal here.
let intelSel = { champ: null, role: null, opp: null, group: 'ALL', q: '', oq: '' };
const iItem = (id, cls = 'itm') => { const it = intelIndex?.items?.[id]; return `<img class="${cls}" alt="${esc(it?.[0] || '')}" title="${esc(it?.[0] || '')}" loading="lazy" src="https://ddragon.leagueoflegends.com/cdn/${D.ddragon}/img/item/${id}.png" onerror="this.style.visibility='hidden'">`; };
const iName = (id) => esc(intelIndex?.items?.[id]?.[0] || `Item ${id}`);
const wrCls = (w) => (w >= 0.53 ? 'up' : w <= 0.47 ? 'down' : '');
/** One option row: icons, how often it is picked, how often it wins, and the games behind it. */
const optRow = (icons, c, of, extra = '') => `<div class="iopt ${c[1] < 20 ? 'few' : ''}" ${c[1] < 20 ? 'title="Fewer than 20 games: read it with care"' : ''}>${icons}<span class="ishare"><b>${pct(c[1] / of)}</b><small>${c[1].toLocaleString('en-GB')} games</small></span><span class="iwin ${wrCls(c[2] / c[1])}"><b>${pct(c[2] / c[1])}</b><small>won</small></span>${extra}</div>`;
// ---------- Intelligence navigation: one search box that understands champion, role and opponent ----------
const ROLE_WORDS = { top: 'TOP', jungle: 'JUNGLE', jg: 'JUNGLE', jungler: 'JUNGLE', mid: 'MIDDLE', middle: 'MIDDLE', bot: 'BOTTOM', adc: 'BOTTOM', bottom: 'BOTTOM', sup: 'UTILITY', supp: 'UTILITY', support: 'UTILITY' };
/** Suggestions for what was typed: "illaoi", "illaoi mid", "illaoi darius", "illaoi vs darius". */
function intelSuggest(text) {
  const pairs = intelIndex.pairs;
  const champs = [...new Set(Object.keys(pairs).map((p) => splitPair(p).champ))];
  const words = text.toLowerCase().split(/\s+/).filter((w) => w && w !== 'vs' && w !== 'v' && w !== 'against');
  if (!words.length) return [];
  const role = words.map((w) => ROLE_WORDS[w]).find(Boolean);
  const names = words.filter((w) => !ROLE_WORDS[w]);
  const find = (w) => champs.filter((c) => plainName(champName(c)).startsWith(plainName(w))).sort((a, b) => (pairs[`${rolesOfC(b)[0]}|${b}`]?.n || 0) - (pairs[`${rolesOfC(a)[0]}|${a}`]?.n || 0));
  const rolesOfC = (c) => Object.keys(ROLES).filter((r) => pairs[`${r}|${c}`]).sort((a, b) => pairs[`${b}|${c}`].n - pairs[`${a}|${c}`].n);
  const firsts = names.length ? find(names[0]).slice(0, 5) : [];
  const out = [];
  for (const c of firsts) {
    const all = rolesOfC(c), roles = role && all.includes(role) ? [role] : all; // a role the champion is not played in falls back to its own roles
    if (names[1]) {
      const opps = find(names[1]).filter((o) => o !== c).slice(0, 3);
      for (const r of roles.slice(0, 1)) for (const o of opps) out.push({ href: `#/intel/${encodeURIComponent(c)}/${r}/${encodeURIComponent(o)}`, c, r, o });
    } else for (const r of roles.slice(0, 3)) out.push({ href: `#/intel/${encodeURIComponent(c)}/${r}`, c, r });
  }
  return out.slice(0, 8);
}
const suggestRow = (x) => `<a href="${x.href}">${icon(x.c)}<b>${champName(x.c)}</b><span class="muted">${ROLES[x.r]}</span>${x.o ? `<span class="vs">vs</span>${icon(x.o)}<b>${champName(x.o)}</b>` : ''}<small>${(intelIndex.pairs[`${x.r}|${x.c}`]?.n || 0).toLocaleString('en-GB')} games</small></a>`;
/** The bar on every Intelligence page: the search, then what is chosen now, each one a button to change or drop. */
function intelBar(cur = {}) {
  const pairs = intelIndex.pairs, { c, r, o } = cur;
  const roles = c ? Object.keys(ROLES).filter((x) => pairs[`${x}|${c}`]).sort((a, b) => pairs[`${b}|${c}`].n - pairs[`${a}|${c}`].n) : [];
  const enc = encodeURIComponent;
  return `<section class="inav" aria-label="Find a champion or a matchup">
    <div class="inav-search"><label class="csearch big"><span class="sr">Search</span><input id="isearch" type="search" placeholder="${c ? 'Another champion, or a matchup: illaoi darius' : 'Champion, role or matchup: illaoi · illaoi mid · illaoi darius'}" autocomplete="off"></label>
      <div class="isuggest" id="isugg" hidden></div></div>
    ${c ? `<div class="inav-now">
      <a class="inow me" href="#/intel" title="All champions">${icon(c)}<b>${champName(c)}</b><span aria-hidden="true">✕</span></a>
      <span class="inow-roles">${roles.map((x) => `<a class="chip ${x === r ? 'on' : ''}" href="#/intel/${enc(c)}/${x}${o ? `/${o === true ? 'counters' : enc(o)}` : ''}">${ROLES[x]}</a>`).join('')}</span>
      ${o && o !== true ? `<a class="inow opp" href="#/intel/${enc(c)}/${r}/counters" title="Any opponent"><span class="vs">vs</span>${icon(o)}<b>${champName(o)}</b><span aria-hidden="true">✕</span></a>` : ''}
      <label class="inow-tier"><span class="sr">Tier</span><select id="igroup">${Object.entries(GROUP_NAMES).map(([g, n]) => `<option value="${g}" ${g === intelSel.group ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    </div>` : ''}
  </section>`;
}
function bindIntelBar(rerender) {
  const q = $('#isearch'), box = $('#isugg');
  if (!q) return;
  let list = [];
  q.oninput = () => { list = intelSuggest(q.value); box.innerHTML = list.map(suggestRow).join('') || (q.value.trim() ? '<p class="small muted">No champion starts with that.</p>' : ''); box.hidden = !q.value.trim(); };
  q.onkeydown = (e) => { if (e.key === 'Enter' && list[0]) location.hash = list[0].href; if (e.key === 'Escape') { q.value = ''; box.hidden = true; } };
  const g = $('#igroup');
  if (g) g.onchange = () => { intelSel.group = g.value; rerender(); };
}
// ---------- Patch history: every change the game files show, patch after patch, since 10.1 (January 2020) ----------
let patchData, patchLoad = 'idle';
function withPatches(then) {
  if (patchLoad === 'idle') { patchLoad = 'loading'; fetch('patches.json').then((r) => (r.ok ? r.json() : null)).then((j) => { patchData = j; patchLoad = j ? 'ready' : 'failed'; then(); }).catch(() => { patchLoad = 'failed'; then(); }); }
  return patchLoad === 'ready';
}
const STAT_NAMES = { hp: 'Health', hpperlevel: 'Health per level', mp: 'Mana', mpperlevel: 'Mana per level', movespeed: 'Move speed', armor: 'Armor', armorperlevel: 'Armor per level', spellblock: 'Magic resist', spellblockperlevel: 'Magic resist per level', attackrange: 'Attack range', hpregen: 'Health regen', hpregenperlevel: 'Health regen per level', attackdamage: 'Attack damage', attackdamageperlevel: 'Attack damage per level', attackspeed: 'Attack speed', attackspeedperlevel: 'Attack speed per level' };
const burnSum = (s) => String(s ?? '').split('/').map(Number).filter((x) => !Number.isNaN(x)).reduce((a, x) => a + x, 0);
/** A ratio as the game shows it: 0.15 is 15%. */
const asShown = (what, v) => (/\bratio\b/i.test(what) && String(v).split('/').every((x) => x !== '' && Math.abs(+x) <= 5) ? String(v).split('/').map((x) => `${+(x * 100).toFixed(1)}%`).join('/') : v);
/** Whether a change helps the champion (1), hurts it (−1) or depends (0). */
function changeDir(x) {
  if (x.k === 'stat') return Math.sign(x.to - x.from);
  if (x.k === 'spell') return x.what === 'range' ? Math.sign(burnSum(x.to) - burnSum(x.from)) : Math.sign(burnSum(x.from) - burnSum(x.to));
  if (x.k !== 'val') return 0;
  const d = Math.sign(burnSum(x.to) - burnSum(x.from));
  if (/reduction|refund|refresh|haste/i.test(x.what)) return d;
  return /cooldown|cost|mana|delay|cast time|wind ?up|lockout/i.test(x.what) ? -d : /damage|\bratio\b|\bheal|shield|bonus|\bamp\b/i.test(x.what) ? d : 0;
}
/** One champion in one patch: Buff, Nerf, Adjusted or Released. */
function patchVerdict(changes) {
  if (changes.some((x) => x.k === 'new')) return ['new', 'Released'];
  const s = changes.reduce((a, x) => a + changeDir(x), 0), up = changes.filter((x) => changeDir(x) > 0).length, down = changes.filter((x) => changeDir(x) < 0).length;
  return up && !down ? ['buff', 'Buff'] : down && !up ? ['nerf', 'Nerf'] : s > 1 ? ['buff', 'Buff'] : s < -1 ? ['nerf', 'Nerf'] : ['adj', 'Adjusted'];
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const patchDate = (v) => { const d = patchData.dates?.[v]; return d ? `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : ''; };
const patchYear = (v) => String(2010 + +v.split('.')[0]); // 10.x is 2020, 16.x is 2026: the season, not the export day
const abilityIcon = (champ, slot) => { const f = patchData.icons?.[champ]?.['PQWER'.indexOf(slot)]; return f ? `<img class="pabil" alt="" loading="lazy" src="https://ddragon.leagueoflegends.com/cdn/${patchData.iconVersion}/img/${slot === 'P' ? 'passive' : 'spell'}/${f}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'pslot',textContent:'${slot}'}))">` : `<span class="pslot">${slot}</span>`; };
/** One change as a line: what, from, to. */
function patchLine(x) {
  const dir = changeDir(x), cls = dir > 0 ? 'up' : dir < 0 ? 'down' : 'pval';
  if (x.k === 'stat') return `<li class="${cls}"><span>${STAT_NAMES[x.what] || x.what}</span><span class="pft"><s>${x.from}</s>→<b>${x.to}</b></span></li>`;
  const what = x.k === 'spell' ? x.what[0].toUpperCase() + x.what.slice(1) : esc(x.what);
  return `<li class="${cls}"><span>${what}</span><span class="pft"><s>${esc(asShown(x.what, x.from))}</s>→<b>${esc(asShown(x.what, x.to))}</b></span></li>`;
}
/** A champion's changes in one patch, grouped: base stats, then each ability with its icon. */
function patchGroups(champ, changes) {
  if (changes.some((x) => x.k === 'new')) return `<p class="small">New champion.</p>`;
  const out = [];
  const stats = changes.filter((x) => x.k === 'stat');
  if (stats.length) out.push(`<div class="pgroup"><div class="pg-head"><span class="pslot">·</span><b>Base stats</b></div><ul>${stats.map(patchLine).join('')}</ul></div>`);
  for (const slot of ['P', 'Q', 'W', 'E', 'R']) {
    const xs = changes.filter((x) => x.slot === slot);
    if (!xs.length) continue;
    const main = xs.filter((x) => x.k === 'spell' || x.k === 'val'), add = xs.filter((x) => x.k === 'add'), del = xs.filter((x) => x.k === 'del');
    out.push(`<div class="pgroup"><div class="pg-head">${abilityIcon(champ, slot)}<b>${esc(xs[0].name || slot)}</b><span class="muted small">${slot === 'P' ? 'Passive' : slot}</span></div>
      ${main.length ? `<ul>${main.map(patchLine).join('')}</ul>` : ''}
      ${add.length || del.length ? `<p class="pextra">${add.length ? `New values: ${add.map((x) => `${esc(x.what)} ${esc(asShown(x.what, x.to))}`).join(' · ')}` : ''}${add.length && del.length ? '<br>' : ''}${del.length ? `No longer listed: ${del.map((x) => esc(x.what)).join(' · ')}` : ''}</p>` : ''}</div>`);
  }
  return out.join('');
}
/** The win rate of a champion and role in each patch we have games of, with the patches that changed it marked. */
function patchChart(champ, pair) {
  const per = intelIndex?.pairs?.[pair]?.patches || {};
  const vs = patchData.versions.filter((v) => per[v]?.[0] >= 30);
  if (vs.length < 3) return '';
  const changed = Object.fromEntries((patchData.champs[champ] || []).map((e) => [e.v.replace(/\.1$/, ''), patchVerdict(e.changes)]));
  const W = 640, H = 150, L = 34, R = 10, T = 12, B = 26;
  const wr = vs.map((v) => per[v][1] / per[v][0]);
  const lo = Math.min(0.44, ...wr) - 0.01, hi = Math.max(0.56, ...wr) + 0.01;
  const x = (i) => L + (i * (W - L - R)) / (vs.length - 1), y = (w) => T + ((hi - w) * (H - T - B)) / (hi - lo);
  const ticks = [0.45, 0.5, 0.55].filter((t) => t > lo && t < hi);
  return `<section class="pchart"><header><b>Win rate per patch</b><span class="small muted">${ROLES[splitPair(pair).role]} · patches with 30 games or more · dots: patches that changed ${champName(champ)}</span></header>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Win rate of ${esc(champName(champ))} in each patch">
      ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="${t === 0.5 ? 'mid' : 'grid'}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t * 100)}%</text>`).join('')}
      <polyline points="${vs.map((v, i) => `${x(i)},${y(wr[i])}`).join(' ')}"/>
      ${vs.map((v, i) => `<g class="pt ${changed[v]?.[0] || ''}"><circle cx="${x(i)}" cy="${y(wr[i])}" r="${changed[v] ? 5 : 3}"/><rect x="${x(i) - 12}" y="${T}" width="24" height="${H - T - B}"><title>${v}: ${pct(wr[i])} over ${per[v][0].toLocaleString('en-GB')} games${changed[v] ? ` · ${changed[v][1]}` : ''}</title></rect></g>`).join('')}
      ${vs.map((v, i) => (i % Math.ceil(vs.length / 8) === 0 || i === vs.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === vs.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}">${v}</text>` : '')).join('')}
    </svg></section>`;
}
/** A champion's whole history, newest first, as a timeline split by year. */
function champHistory(champ, pair) {
  const list = [...(patchData.champs[champ] || [])].reverse();
  if (!list.length) return `<p class="muted">No change to ${champName(champ)} in the game files since 10.1.</p>`;
  const per = pair ? intelIndex?.pairs?.[pair]?.patches || {} : {};
  let year = '';
  return `<ol class="ptl">${list.map((e) => {
    const v = e.v.replace(/\.1$/, ''), [cls, word] = patchVerdict(e.changes), y = patchYear(v), wr = per[v];
    const sep = y !== year ? ((year = y), `<li class="ptl-year"><span>${y}</span></li>`) : '';
    return `${sep}<li class="ptl-item ${cls}"><div class="ptl-when"><a href="#/intel/patches/${v}"><b>${v}</b></a><small>${patchDate(v)}</small></div><div class="ptl-card"><header><span class="pverdict ${cls}">${word}</span>${wr?.[0] >= 30 ? `<span class="pwr ${wrCls(wr[1] / wr[0])}">${pct(wr[1] / wr[0])} <small>in ${v}, ${wr[0].toLocaleString('en-GB')} games</small></span>` : ''}</header>${patchGroups(champ, e.changes)}</div></li>`;
  }).join('')}</ol>`;
}
/** Every champion changed in one patch, buffs first. */
function patchView(v) {
  const rows = Object.entries(patchData.champs).map(([c, a]) => [c, a.find((e) => e.v === `${v}.1`)]).filter(([, e]) => e).map(([c, e]) => [c, e, patchVerdict(e.changes)]);
  const order = { new: 0, buff: 1, nerf: 2, adj: 3 };
  rows.sort((a, b) => order[a[2][0]] - order[b[2][0]] || champName(a[0]).localeCompare(champName(b[0])));
  const count = (k) => rows.filter((r) => r[2][0] === k).length;
  const i = patchData.versions.indexOf(v), prev = patchData.versions[i - 1], next = patchData.versions[i + 1];
  return `<header class="pv-head"><div><p class="eyebrow">${patchDate(v) ? `Around ${patchDate(v)}` : 'Patch'}</p><h2>Patch ${v}</h2></div>
      <div class="pv-count">${[['new', 'released'], ['buff', 'buffed'], ['nerf', 'nerfed'], ['adj', 'adjusted']].filter(([k]) => count(k)).map(([k, n]) => `<span class="pverdict ${k}">${count(k)} ${n}</span>`).join('') || '<span class="muted small">No champion changed in the game files.</span>'}</div>
      <nav class="pv-nav">${prev ? `<a class="btn ghost small" href="#/intel/patches/${prev}">← ${prev}</a>` : ''}${next ? `<a class="btn ghost small" href="#/intel/patches/${next}">${next} →</a>` : ''}</nav></header>
    <div class="pv-grid">${rows.map(([c, e, [cls, word]]) => `<article class="pv-card ${cls}"><a class="pv-champ" href="#/intel/patches/${encodeURIComponent(c)}" title="Every change to ${esc(champName(c))}">${icon(c)}<b>${champName(c)}</b><span class="pverdict ${cls}">${word}</span></a>${patchGroups(c, e.changes)}</article>`).join('')}</div>`;
}
const patchNote = `<p class="small muted pnote">From the game files of each patch (Riot's Data Dragon and CommunityDragon's export of the game data), since 10.1 in January 2020: base stats, and for each ability its cooldown, cost, range and the numbers inside it, by rank. Green helps the champion, red hurts it, white depends on the ability. Dates are near enough: the day the files were exported. The <a href="https://www.leagueoflegends.com/en-gb/news/game-updates/" target="_blank" rel="noopener">official patch notes</a> say why.</p>`;
/** #/intel/patches (the latest patch), #/intel/patches/16.21 (one patch), #/intel/patches/Illaoi (one champion). */
function viewPatches(arg) {
  const again = () => { if ((location.hash || '').startsWith('#/intel/patches')) viewPatches(arg); };
  const ready = withPatches(again);
  let champ = '', ver = '';
  if (ready) { if (patchData.versions.includes(arg)) ver = arg; else if (arg && (patchData.champs[arg] || arg in D.champions)) champ = arg; else ver = patchData.versions[patchData.versions.length - 1]; }
  const roleOf = champ && intelIndex ? Object.keys(ROLES).filter((r) => intelIndex.pairs[`${r}|${champ}`]).sort((a, b) => intelIndex.pairs[`${b}|${champ}`].n - intelIndex.pairs[`${a}|${champ}`].n)[0] : null;
  const pair = roleOf ? `${roleOf}|${champ}` : null;
  const champs = ready ? Object.keys(patchData.champs).sort((a, b) => champName(a).localeCompare(champName(b))) : [];
  const years = {};
  if (ready) for (const v of [...patchData.versions].reverse()) (years[patchYear(v)] ||= []).push(v);
  app.innerHTML = `${intelHead()}
  ${intelBar()}
  <nav class="itabs"><a href="#/intel">Tier list</a><a class="on" href="#/intel/patches">Patch history</a></nav>
  ${!ready ? `<p class="muted">${patchLoad === 'failed' ? 'Could not load the patch history. Reload the page to try again.' : 'Loading the patches…'}</p>` : `
  <div class="ipatches">
    <aside class="prail">
      <div class="prail-search"><label class="csearch"><span class="sr">Champion</span><input id="pq" type="search" placeholder="Filter by champion" autocomplete="off"></label>
        <div class="isuggest" id="psugg" hidden></div></div>
      ${champ ? `<a class="prail-back" href="#/intel/patches">← Every champion</a>` : ''}
      <div class="prail-years">${Object.entries(years).sort((a, b) => b[0] - a[0]).map(([y, vs]) => `<details ${vs.includes(ver) || (!ver && y === Object.keys(years).sort().pop()) ? 'open' : ''}><summary>${y}<small>${vs.length} patches</small></summary>
        <div class="prail-list">${vs.map((v) => { const n = champ ? (patchData.champs[champ] || []).find((e) => e.v === `${v}.1`) : null; const k = Object.values(patchData.champs).filter((a) => a.some((e) => e.v === `${v}.1`)).length; return `<a class="${v === ver ? 'on' : ''} ${champ && !n ? 'dim' : ''}" href="#/intel/patches/${v}"><b>${v}</b><small>${patchDate(v).slice(0, 3)}</small>${champ ? (n ? `<i class="pdot ${patchVerdict(n.changes)[0]}"></i>` : '') : `<small>${k}</small>`}</a>`; }).join('')}</div></details>`).join('')}</div>
    </aside>
    <div class="pmain">
      ${champ ? `<header class="pc-head" style="--splash:url('https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champ}_0.jpg')"><div class="pc-name">${icon(champ, 'champ lg')}<div><p class="eyebrow">Patch history</p><h2>${champName(champ)}</h2><p class="small">${(patchData.champs[champ] || []).length} patches changed ${champName(champ)} since 10.1 · ${['buff', 'nerf', 'adj'].map((k) => `${(patchData.champs[champ] || []).filter((e) => patchVerdict(e.changes)[0] === k).length} ${{ buff: 'buffs', nerf: 'nerfs', adj: 'adjustments' }[k]}`).join(' · ')}</p></div></div>${roleOf ? `<a class="btn small" href="#/intel/${encodeURIComponent(champ)}/${roleOf}">Build and counters</a>` : ''}</header>
        ${pair ? patchChart(champ, pair) : ''}${champHistory(champ, pair)}` : patchView(ver)}
      ${patchNote}
    </div>
  </div>`}`;
  bindIntelBar(() => {});
  const pq = $('#pq'), box = $('#psugg');
  if (pq && box) {
    let hits = [];
    pq.oninput = () => { const q = plainName(pq.value); hits = q ? champs.filter((c) => plainName(champName(c)).startsWith(q)).slice(0, 8) : []; box.innerHTML = hits.map((c) => `<a href="#/intel/patches/${encodeURIComponent(c)}">${icon(c)}<b>${champName(c)}</b><small>${patchData.champs[c].length} patches</small></a>`).join('') || (q ? '<p class="small muted">No champion starts with that.</p>' : ''); box.hidden = !q; };
    pq.onkeydown = (e) => { if (e.key === 'Enter' && hits[0]) location.hash = `#/intel/patches/${encodeURIComponent(hits[0])}`; if (e.key === 'Escape') { pq.value = ''; box.hidden = true; } };
  }
}
/** Intelligence: #/intel is the champion list and the tier list; #/intel/Champion opens its most played role;
 *  #/intel/Champion/ROLE is the build; #/intel/Champion/ROLE/counters and .../Opponent are the counters. */
function viewIntel(arg = '') {
  if (needAccount()) return;
  const [champArg, roleArg, oppArg] = arg.split('/').map(decodeURIComponent);
  const again = () => { if ((location.hash || '').startsWith('#/intel')) viewIntel(arg); };
  if (!withIntel(null, again)) { app.innerHTML = `${intelHead()}<p class="muted">${intelIndexLoad === 'failed' ? 'Could not load the champions\' data. Reload the page to try again.' : 'Loading every champion…'}</p>`; return; }
  if (champArg === 'patches') return viewPatches(roleArg || '');
  const pairs = intelIndex.pairs;
  const roleN = (c, r) => pairs[`${r}|${c}`]?.n || 0;
  const rolesOf = (c) => Object.keys(ROLES).filter((r) => roleN(c, r) > 0).sort((a, b) => roleN(c, b) - roleN(c, a));
  if (!champArg || !rolesOf(champArg).length) return intelStart();
  const roles = rolesOf(champArg);
  const role = roles.includes(roleArg) ? roleArg : roles[0];
  const pair = `${role}|${champArg}`;
  const ready = withIntel(pair, again), file = intelCache[pair];
  const tab = oppArg === 'patches' ? 'patches' : oppArg ? 'counters' : 'build';
  const base = `#/intel/${encodeURIComponent(champArg)}/${role}`;
  // The counters open on the opponent met most, as op.gg does.
  const opps = file ? Object.entries(file.mu || {}).sort((a, b) => b[1].n - a[1].n).map(([c]) => c) : [];
  const opp = tab === 'counters' ? (oppArg !== 'counters' && opps.includes(oppArg) ? oppArg : opps[0]) : null;
  intelSel = { ...intelSel, champ: champArg, role, opp };
  const G = file && (file.groups[intelSel.group] || file.groups.ALL);
  app.innerHTML = `${intelHead()}
  ${intelBar({ c: champArg, r: role, o: tab === 'counters' ? (opp || true) : null })}
  <section class="ichead">${portrait(champArg)}<div class="ichead-main"><p class="eyebrow">${GROUP_NAMES[intelSel.group]}</p><h2>${champName(champArg)} <span class="muted">${ROLES[role]}</span></h2></div>
    ${G ? `<div class="ichead-nums"><div><span>Win rate</span><b class="${wrCls(G.w / G.n)}">${pct(G.w / G.n)}</b></div><div><span>Pick rate</span><b>${(G.pick * 100).toFixed(G.pick < 0.01 ? 2 : 1)}%</b></div><div><span>Ban rate</span><b>${((intelIndex.bans[champArg] ?? 0) * 100).toFixed(1)}%</b></div><div><span>Games</span><b>${G.n.toLocaleString('en-GB')}</b></div></div>` : ''}
  </section>
  <nav class="itabs">${[['build', 'Build', base], ['counters', 'Counters', `${base}/counters`], ['patches', 'Patches', `${base}/patches`]].map(([k, n, h]) => `<a class="${tab === k ? 'on' : ''}" href="${h}">${n}</a>`).join('')}</nav>
  <div id="intel-body">${!ready ? '<p class="muted">Loading…</p>' : !file ? '<p class="muted">Too few games with this champion and role in our data.</p>' : tab === 'build' ? intelBody(pair, file) : tab === 'patches' ? (withPatches(again) ? `<div class="pmain solo">${patchChart(champArg, pair)}${champHistory(champArg, pair)}${patchNote}</div>` : '<p class="muted">Loading the patches…</p>') : countersTab(pair, file, opp, opps, base)}</div>
  ${contestNudge(`Studied ${champName(champArg)}? Put it to the test.`, 'Enter your next solo queue game in a contest: free training contests, or prize contests with 3 challenges.', '#/contests')}`;
  bindIntelBar(() => { const y = scrollY; viewIntel(arg); scrollTo(0, y); });
  app.querySelectorAll('[data-iopp]').forEach((b) => (b.onclick = () => { location.hash = `${base}/${encodeURIComponent(b.dataset.iopp)}`; }));
  const cq = $('#cq'), cl = $('#clist');
  if (cq && cl) cq.oninput = () => { const q = plainName(cq.value); cl.querySelectorAll('a').forEach((a) => (a.hidden = !a.dataset.name.startsWith(q))); };
}
const intelHead = () => `<div class="route-title"><p class="eyebrow">Study the game</p><h1>Intelligence</h1><p>Builds, matchups and the numbers of every champion, from ${(intelIndex?.matches || D.facts.games).toLocaleString('en-GB')} ranked games on EUW.</p></div>`;
let tlRole = '';
/** Tier of a champion and role: its win rate pulled towards 50% when it has few games, and a minimum of play. */
const tierOf = (n, w, pick) => { const s = (w + 100) / (n + 200); if (pick < 0.005) return 5; const t = s >= 0.52 ? 1 : s >= 0.51 ? 2 : s >= 0.5 ? 3 : s >= 0.49 ? 4 : 5; return pick < 0.01 ? Math.max(3, t) : t; }; // tiers 1 and 2 need 1% of the role's games
/** The start: every champion on one side, the tier list on the other. */
function intelStart() {
  const pairs = intelIndex.pairs;
  const champs = [...new Set(Object.keys(pairs).map((p) => splitPair(p).champ))].sort((a, b) => champName(a).localeCompare(champName(b)));
  const rolesOf = (c) => Object.keys(ROLES).filter((r) => (pairs[`${r}|${c}`]?.n || 0) >= 30);
  const g = intelSel.group;
  const rows = Object.entries(pairs).map(([pair, x]) => { const [n, w, pick] = x.groups[g] || [0, 0, 0]; return { pair, n, w, pick: pick ?? x.pick, weak: x.weak || [] }; })
    .filter((r) => r.n >= 100 && (!tlRole || splitPair(r.pair).role === tlRole))
    .map((r) => ({ ...r, s: (r.w + 100) / (r.n + 200), tier: tierOf(r.n, r.w, r.pick) }))
    .sort((a, b) => a.tier - b.tier || b.s - a.s);
  app.innerHTML = `${intelHead()}
  ${intelBar()}
  <nav class="itabs"><a class="on" href="#/intel">Tier list</a><a href="#/intel/patches">Patch history</a></nav>
  <div class="istart one">
    <section class="itier"><div class="itier-tabs">${[['', 'All'], ...Object.entries(ROLES)].map(([r, n]) => `<button class="${tlRole === r ? 'on' : ''}" data-tlrole="${r}">${n}</button>`).join('')}</div>
      <div class="chips">${Object.entries(GROUP_NAMES).map(([k, n]) => `<button class="chip ${k === g ? 'on' : ''}" data-igroup="${k}">${n}</button>`).join('')}</div>
      <div class="tablewrap tscroll"><table class="num tiers"><tr><th>#</th><th>Champion</th><th>Tier</th><th>Role</th><th>Win rate</th><th>Pick rate</th><th>Ban rate</th><th>Weak against</th></tr>
      ${rows.map((r, i) => { const { role, champ } = splitPair(r.pair); return `<tr class="trow-link" data-go="#/intel/${encodeURIComponent(champ)}/${role}"><td class="muted">${i + 1}</td><td class="gchamp">${icon(champ)}<span><b>${champName(champ)}</b></span></td><td><b class="tier t${r.tier}">${r.tier}</b></td><td class="muted">${ROLES[role]}</td><td class="${wrCls(r.w / r.n)}">${(r.w / r.n * 100).toFixed(2)}%</td><td>${(r.pick * 100).toFixed(2)}%</td><td>${((intelIndex.bans[champ] ?? 0) * 100).toFixed(2)}%</td><td class="weak">${r.weak.map(([c, n, w]) => `<span title="${champName(c)}: ${pct(w / n)} over ${n} games">${icon(c)}</span>`).join('')}</td></tr>`; }).join('')}</table></div>
      <p class="small muted">Tier: the win rate, pulled towards 50% when there are few games, with a minimum of play. ${rows.length} champions and roles with 100 games or more.</p></section>
  </div>
  ${contestNudge('Know the game? Prove it.', 'Enter your next solo queue game in a contest: free training contests, or prize contests with 3 challenges.', '#/contests')}`;
  bindIntelBar(() => {});
  const keep = () => { const y = scrollY; intelStart(); scrollTo(0, y); };
  app.querySelectorAll('[data-tlrole]').forEach((b) => (b.onclick = () => { tlRole = b.dataset.tlrole; keep(); }));
  app.querySelectorAll('[data-igroup]').forEach((b) => (b.onclick = () => { intelSel.group = b.dataset.igroup; keep(); }));
  app.querySelectorAll('[data-go]').forEach((tr) => (tr.onclick = () => { location.hash = tr.dataset.go; }));
}
/** The counters: every lane opponent on one side, the chosen matchup on the other. */
function countersTab(pair, file, opp, opps, base) {
  const champ = splitPair(pair).champ;
  const list = opps.map((c) => ({ c, ...file.mu[c] })).map((x) => ({ ...x, wr: x.w / x.n }));
  return `<div class="icounter">
    <aside class="clist"><label class="csearch"><span class="sr">Search an opponent</span><input id="cq" type="search" placeholder="Search a champion" autocomplete="off"></label>
      <div class="clist-head"><span></span><span>Win rate</span><span>Games</span></div>
      <div id="clist">${list.map((x) => `<a class="${x.c === opp ? 'on' : ''}" href="${base}/${encodeURIComponent(x.c)}" data-name="${esc(plainName(champName(x.c)))}">${icon(x.c)}<span>${champName(x.c)}</span><b class="${wrCls(x.wr)}">${pct(x.wr)}</b><small>${x.n.toLocaleString('en-GB')}</small></a>`).join('')}</div></aside>
    <div class="mdetail">${opp ? matchupDetail(pair, file, opp) : '<p class="muted">No opponent with enough games.</p>'}</div>
  </div>`;
}
/** Both sides of a matchup, then the lane, then what the winners build. */
function matchupDetail(pair, file, opp) {
  const champ = splitPair(pair).champ, me = champName(champ), them = champName(opp);
  const M = file.mu[opp], L = file.lane?.[opp], mk = file.muKeys, lk = file.laneKeys;
  const m = (k) => M.all[mk.indexOf(k)], l = (k) => (L ? L.all[lk.indexOf(k)] : null);
  const wr = M.w / M.n;
  const kda = (k, d, a) => ((k + a) / Math.max(1, d)).toFixed(2);
  const both = [];
  if (L) {
    const lkS = l('lk') + l('lko') ? l('lk') / (l('lk') + l('lko')) : 0.5;
    both.push(['Lane kills', pct(lkS), pct(1 - lkS), lkS]);
  }
  both.push(['KDA', `${kda(m('k'), m('d'), m('a'))} : 1`, `${kda(m('ok'), m('od'), m('oa'))} : 1`, (m('k') + m('a')) / Math.max(1, m('d')) / ((m('k') + m('a')) / Math.max(1, m('d')) + (m('ok') + m('oa')) / Math.max(1, m('od')))]);
  both.push(['Kill participation', pct(m('kp')), pct(m('okp')), m('kp') / (m('kp') + m('okp'))]);
  both.push(['Damage to champions', Math.round(m('dmg')).toLocaleString('en-GB'), Math.round(m('odmg')).toLocaleString('en-GB'), m('dmg') / (m('dmg') + m('odmg'))]);
  if (L) {
    const mmss = (x) => `${Math.floor(x)}'${String(Math.round((x % 1) * 60)).padStart(2, '0')}"`;
    both.push(['First tower', mmss(l('ft')), mmss(l('oft')), l('oft') / (l('ft') + l('oft'))]);
    both.push(['Lane won (gold ahead at 14)', pct(l('lw')), pct(1 - l('lw')), l('lw')]);
  }
  both.push(['Win rate', pct(wr), pct(1 - wr), wr]);
  // what the winners build: the options that won most often, with how often they win
  const won = (arr, n = 3) => (arr || []).slice().sort((a, b) => b[2] - a[2]).slice(0, n);
  const wrow = (icons, c) => `<div class="iopt">${icons}<span class="ishare"><b>${pct(c[2] / Math.max(1, M.w))}</b><small>of wins</small></span><span class="iwin ${wrCls(c[2] / c[1])}"><b>${pct(c[2] / c[1])}</b><small>${c[1]} games</small></span></div>`;
  return `<header class="cvs">${icon(champ, 'champ lg')}<div class="cvs-bar"><b>${pct(wr)}</b><span class="vbar"><i style="width:${wr * 100}%"></i></span><b>${pct(1 - wr)}</b></div>${icon(opp, 'champ lg')}</header>
    <p class="small muted cvs-sub">${me} against ${them}: ${M.n.toLocaleString('en-GB')} games, every tier${L ? `; the lane from ${L.n} with a timeline` : ''}.</p>
    <div class="vs-rows">${both.map(([n, a, b, share]) => `<div class="vs-row"><b class="${share > 0.52 ? 'up' : ''}">${a}</b><span class="vs-mid"><small>${n}</small><span class="vbar thin"><i style="width:${Math.max(0, Math.min(1, share)) * 100}%"></i></span></span><b class="${share < 0.48 ? 'up' : ''}">${b}</b></div>`).join('')}</div>
    ${L ? matchupSection(pair, file).replace(/^<section class="imatch">[\s\S]*?<\/header>/, '<section class="imatch inner">') : ''}
    <section class="iwinners"><h3>What the winners build against ${them}</h3><p class="small muted">The choices that won most often in the ${M.w} games ${me} won, and how often each one wins.</p>
      <div class="iwin-grid">
        <div><h4>Keystone</h4>${won(M.keystone).map((c) => wrow(`<span class="iname">${runeIcon(c[0])}${esc(intelIndex.runes[c[0]] || c[0])}</span>`, c)).join('') || '<p class="small muted">Too few games.</p>'}</div>
        <div><h4>Rune page</h4>${won(M.runes, 2).map((c) => wrow(`<span class="ipage">${String(c[0]).split('|').map((part, j) => part.split('.').map((x, i) => `<span class="${j === 0 && i === 0 ? 'ks' : ''}">${runeIcon(x)}</span>`).join('')).join('<i></i>')}</span>`, c)).join('') || '<p class="small muted">Too few games.</p>'}</div>
        <div><h4>Summoner spells</h4>${won(M.spells).map((c) => wrow(`<span class="iname">${String(c[0]).split('.').map(spellIcon).join('')}${String(c[0]).split('.').map((x) => intelIndex.spells[x]?.[0] || x).join(' + ')}</span>`, c)).join('')}</div>
        <div><h4>Trinket</h4>${won(M.trinket, 2).map((c) => wrow(`<span class="iname">${iItem(c[0])}${iName(c[0])}</span>`, c)).join('')}</div>
        ${L ? `<div><h4>Boots</h4>${won(L.boots, 2).map((c) => wrow(`<span class="iname">${iItem(c[0])}${iName(c[0])}</span>`, c)).join('') || '<p class="small muted">Too few games.</p>'}</div>` : ''}
        <div><h4>Items at the end</h4>${won(M.items, 5).map((c) => wrow(`<span class="iname">${iItem(c[0])}${iName(c[0])}</span>`, c)).join('')}</div>
      </div></section>`;
}
function intelBody(pair, file) {
  const champ = champName(splitPair(pair).champ), gname = GROUP_NAMES[intelSel.group];
  const G = file.groups[intelSel.group] || file.groups.ALL;
  if (!G) return '<p class="muted">Too few games.</p>';
  const ban = intelIndex.bans[splitPair(pair).champ] ?? 0;
  const tiers = intelIndex.pairs[pair].groups;
  const dmg = G.dmg;
  const k = (key) => key.split('.').map(Number);
  // runes: a full page is keystone + 3 + 2
  const runePage = ([key, n, w]) => { const [a, b] = key.split('|'); return optRow(`<span class="ipage">${k(a).map((x, i) => `<span class="${i === 0 ? 'ks' : ''}">${runeIcon(x)}</span>`).join('')}<i></i>${k(b).map((x) => runeIcon(x)).join('')}</span>`, [key, n, w], G.n); };
  const counters = (G.opp || []).filter((o) => o[1] >= 15).map(([c, n, w]) => ({ c, n, w: w / n }));
  const hard = counters.slice().sort((a, b) => a.w - b.w).slice(0, 8), easy = counters.slice().sort((a, b) => b.w - a.w).slice(0, 8);
  const cRow = (o) => `<button class="icount" data-iopp="${o.c}">${icon(o.c)}<span><b>${champName(o.c)}</b><small>${o.n.toLocaleString('en-GB')} games</small></span><b class="${wrCls(o.w)}">${pct(o.w)}</b></button>`;
  const mates = Object.entries(G.mates || {}).map(([r, list]) => [r, list.filter((m) => m[1] >= 15).map(([c, n, w]) => ({ c, n, w: w / n })).sort((a, b) => b.w - a.w).slice(0, 3)]).filter(([, l]) => l.length);
  const lenMax = Math.max(...G.len.map((x) => x[1] || 0));
  const bar = (w) => `<span class="ibar"><i class="${wrCls(w)}" style="width:${Math.max(4, (w - 0.35) / 0.3 * 100)}%"></i></span>`;
  return `
  <section class="isum dmg-only">
    <div class="wide"><span>Damage dealt</span><span class="idmg"><i class="ph" style="width:${dmg[0] * 100}%"></i><i class="mg" style="width:${dmg[1] * 100}%"></i><i class="tr" style="width:${dmg[2] * 100}%"></i></span><small>physical ${pct(dmg[0])} · magic ${pct(dmg[1])} · true ${pct(dmg[2])}</small></div>
  </section>
  <div class="igrid">
    <section class="icard"><h3>Runes</h3>${(G.runes || []).slice(0, 3).map(runePage).join('') || '<p class="small muted">Too few games.</p>'}
      <h4>Keystones</h4>${(G.keystone || []).slice(0, 4).map(([key, n, w]) => optRow(`<span class="iname">${runeIcon(key)}${esc(intelIndex.runes[key] || key)}</span>`, [key, n, w], G.n)).join('')}</section>
    <section class="icard"><h3>Summoner spells</h3>${(G.spells || []).slice(0, 3).map(([key, n, w]) => optRow(`<span class="iname">${String(key).split('.').map(spellIcon).join('')}${String(key).split('.').map((x) => intelIndex.spells[x]?.[0] || x).join(' + ')}</span>`, [key, n, w], G.n)).join('')}
      <h3>Trinket</h3>${(G.trinket || []).slice(0, 3).map(([key, n, w]) => optRow(`<span class="iname">${iItem(key)}${iName(key)}</span>`, [key, n, w], G.n)).join('') || '<p class="small muted">Too few games.</p>'}
      <h3>Skills</h3>${(G.skills || []).slice(0, 2).map(([key, n, w]) => optRow(`<span class="iname"><b class="skills">${esc(key)}</b> <small class="muted">priority</small></span>`, [key, n, w], G.tl)).join('')}${(G.first3 || []).slice(0, 2).map(([key, n, w]) => optRow(`<span class="iname"><b class="skills">${esc(key.split('').join(' '))}</b> <small class="muted">first levels</small></span>`, [key, n, w], G.tl)).join('')}</section>
    <section class="icard wide"><h3>Items <span class="small muted">· from ${G.tl.toLocaleString('en-GB')} games with a timeline</span></h3>
      <div class="iitems">
        <div><h4>Starting items</h4>${(G.start || []).slice(0, 3).map(([key, n, w]) => optRow(`<span class="iname">${k(key).map((x) => iItem(x)).join('')}</span>`, [key, n, w], G.tl)).join('')}</div>
        <div><h4>Boots</h4>${(G.boots || []).slice(0, 3).map(([key, n, w, m]) => optRow(`<span class="iname">${iItem(key)}${iName(key)}</span>`, [key, n, w], G.tl, `<span class="imin"><b>${m ? `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}` : '—'}</b><small>bought at</small></span>`)).join('')}</div>
        <div class="span2"><h4>First three items</h4>${(G.path || []).slice(0, 5).map(([key, n, w]) => optRow(`<span class="ipath">${k(key).map((x) => iItem(x)).join('<i>›</i>')}</span>`, [key, n, w], G.tl)).join('') || '<p class="small muted">Too few games.</p>'}</div>
        ${['slot4', 'slot5', 'slot6'].map((s, i) => `<div><h4>${['Fourth', 'Fifth', 'Sixth'][i]} item</h4>${(G[s] || []).slice(0, 3).map(([key, n, w]) => optRow(`<span class="iname">${iItem(key)}${iName(key)}</span>`, [key, n, w], G[s].reduce((a, x) => a + x[1], 0))).join('') || '<p class="small muted">Too few games.</p>'}</div>`).join('')}
      </div></section>
    <section class="icard"><h3>Counters <span class="small muted">· lane opponents, 15+ games</span></h3><div class="icounters"><div><h4 class="down">Hardest</h4>${hard.map(cRow).join('')}</div><div><h4 class="up">Easiest</h4>${easy.map(cRow).join('')}</div></div></section>
    <section class="icard"><h3>Best teammates</h3>${mates.map(([r, l]) => `<div class="imates"><span class="lbl">${ROLES[r]}</span>${l.map((m) => `<span class="imate">${icon(m.c)}<b class="${wrCls(m.w)}">${pct(m.w)}</b><small>${m.n}</small></span>`).join('')}</div>`).join('') || '<p class="small muted">Too few games.</p>'}
      <h3>Win rate by game length</h3>${G.len.map(([l, n, w]) => `<div class="ilen"><span>${l} min</span>${n ? bar(w / n) : '<span class="ibar"></span>'}<b class="${n ? wrCls(w / n) : ''}">${n ? pct(w / n) : '—'}</b><small>${n}</small></div>`).join('')}
      <h3>Win rate by tier</h3>${Object.entries(tiers).filter(([g]) => g !== 'ALL').map(([g, [n, w]]) => `<div class="ilen"><span>${GROUP_NAMES[g]}</span>${n >= 10 ? bar(w / n) : '<span class="ibar"></span>'}<b class="${n >= 10 ? wrCls(w / n) : ''}">${n >= 10 ? pct(w / n) : '—'}</b><small>${n}</small></div>`).join('')}</section>
  </div>
  <p class="small muted">Every number comes with the games behind it. Recent patches, EUW ranked solo. With Riot's production key: one patch at a time and many more games.</p>`;
}
/** Champion against champion: the lane, what the winners do differently, and the build against it. */
function matchupSection(pair, file) {
  const champ = champName(splitPair(pair).champ), them = champName(intelSel.opp);
  const L = file.lane?.[intelSel.opp];
  const o = (file.groups.ALL?.opp || []).find((x) => x[0] === intelSel.opp);
  const keys = file.laneKeys;
  const ix = (k2) => keys.indexOf(k2);
  const fmtv = (k2, v) => (v == null ? '—' : ['d14', 'plT', 'plL'].includes(k2) ? v.toFixed(1) : ['fbT', 'fbG'].includes(k2) ? pct(v) : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(Math.round(v)).toLocaleString('en-GB')}`);
  const rows = [['cs10', 'CS gap at 10 minutes'], ['gold10', 'Gold gap at 10 minutes'], ['xp10', 'XP gap at 10 minutes'], ['gold14', 'Gold gap at 14 minutes'], ['xp14', 'XP gap at 14 minutes'], ['d14', 'Deaths before minute 14'], ['plT', 'Plates taken before 14'], ['plL', 'Plates lost before 14'], ['fbT', 'Took part in first blood'], ['fbG', 'Gave first blood']];
  return `<section class="imatch"><header class="panel-head"><div><p class="eyebrow">Matchup · every tier</p><h2>${champ} against ${them}</h2></div>${o ? `<strong class="imwr ${wrCls(o[2] / o[1])}">${pct(o[2] / o[1])}<small>${champ} wins · ${o[1].toLocaleString('en-GB')} games</small></strong>` : ''}</header>
    ${!L ? `<p class="muted small">Fewer than 10 games of this lane with a timeline: the lane numbers need more data.</p>` : `
    <div class="tablewrap"><table class="num imtable"><tr><th>${champ}, gap to ${them}</th><th>All ${L.n} games</th><th class="w">Won (${L.w})</th><th class="l">Lost (${L.n - L.w})</th></tr>
    ${rows.map(([k2, n]) => `<tr><td>${n}</td><td><b>${fmtv(k2, L.all[ix(k2)])}</b></td><td>${fmtv(k2, L.won?.[ix(k2)])}</td><td>${fmtv(k2, L.lost?.[ix(k2)])}</td></tr>`).join('')}</table></div>
    <div class="imbuild"><div><h4>First item against ${them}</h4>${(L.first || []).map(([key, n, w]) => optRow(`<span class="iname">${iItem(key)}${iName(key)}</span>`, [key, n, w], L.n)).join('') || '<p class="small muted">Too few games.</p>'}</div>
      <div><h4>First three items against ${them}</h4>${(L.path || []).map(([key, n, w]) => optRow(`<span class="ipath">${String(key).split('.').map((x) => iItem(x)).join('<i>›</i>')}</span>`, [key, n, w], L.n)).join('') || '<p class="small muted">Too few games.</p>'}</div></div>`}</section>`;
}
function trendChart(values) {
  const w = 320, h = 90, pad = 6, max = 80, min = 20;
  const x = (i) => pad + (i * (w - 2 * pad)) / Math.max(1, values.length - 1);
  const y = (v) => h - pad - ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (h - 2 * pad);
  return `<svg class="trend" viewBox="0 0 ${w} ${h}" role="img" aria-label="Average position per 10 games: ${values.map((v) => Math.round(v)).join(', ')}"><line class="mid" x1="${pad}" x2="${w - pad}" y1="${y(50)}" y2="${y(50)}"/><text x="${w - pad}" y="${y(50) - 4}" text-anchor="end">50</text><polyline points="${values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>${values.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3"><title>${Math.round(v)}</title></circle>`).join('')}</svg>`;
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
  <div class="tablewrap"><table class="num stats"><tr><th>Champion</th>${STAT_COLS.map(([k, n]) => `<th><button class="sort ${intel.sort === k ? 'on' : ''}" data-sort="${k}">${n}${intel.sort === k ? (intel.dir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`).join('')}</tr>
  ${shown.map(({ pair, e }) => { const m = myOf(pair); const open = intel.open === pair; return `<tr class="srow ${m ? 'yours' : ''} ${open ? 'open' : ''}" data-open="${pair}"><td class="gchamp">${icon(splitPair(pair).champ)}<span><b>${champName(splitPair(pair).champ)}</b><small>${ROLES[splitPair(pair).role]}</small></span></td>${STAT_COLS.map(([k]) => `<td>${statFmt(k, statVal(e, k))}</td>`).join('')}</tr>`; }).join('')}</table></div>
  ${rows.length > shown.length ? `<button class="btn ghost small" id="more-champs">Show 40 more (${rows.length - shown.length} left)</button>` : ''}`;
  $('#st-table').querySelectorAll('[data-sort]').forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); const k = b.dataset.sort; intel.dir = intel.sort === k ? -intel.dir : -1; intel.sort = k; renderChampStats(); }));
  $('#st-table').querySelectorAll('[data-open]').forEach((r) => (r.onclick = () => { const { role, champ } = splitPair(r.dataset.open); intelSel = { ...intelSel, champ, role, opp: null, q: '', oq: '' }; viewIntel(); scrollTo({ top: 0, behavior: 'smooth' }); }));
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
  if (sub === 'contest') { location.replace(`#/contests/t/${id}`); return; }
  if (sub === 'signups') { location.replace('#/contests/signups'); return; }
  if (sub) { location.replace('#/train'); return; }
  const again = () => { if ((location.hash || '#/train') === '#/train') viewTrain(); };
  const ready = withTraining(again) & withStats(again);
  const contest = Object.values(S.imp).find((c) => c.state === 'open' && c.entries.some((e) => e.you));
  const head = `<div class="route-title"><p class="eyebrow">Improve yourself</p><h1>Training</h1><p>Where you see what's wrong and fix it, against the average ${tierName(P().tier)} player with the same champion.</p></div>`;
  trainContest = contest;
  if (!ready) { app.innerHTML = `${head}<p class="muted">${trainLoad === 'failed' || statsLoad === 'failed' ? 'Could not load your games\' data. Reload the page to try again.' : 'Loading your games…'}</p>`; return; }
  const list = improveList();
  syncContests();
  app.innerHTML = `${head}${pickBar()}<div id="train-below">${champView(list)}${trainNudge()}${habitsBlock()}${matchHistory()}</div>`;
  bindTrain();
}
let trainContest = null;
let trainRoleF = '', trainQ = '';
const plainName = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
/** The slider's champions: the role filter and the name search, most played first, then by name. */
function sliderChamps() {
  const counts = {};
  for (const g of rankedHistory()) counts[g.champ] = (counts[g.champ] || 0) + 1;
  // Training is about your champions: the 10 you played most. Every other champion is in Intelligence.
  const champs = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || champName(a).localeCompare(champName(b))).slice(0, 10);
  return { champs, counts };
}
const portrait = (c) => `<img class="portrait" alt="" loading="lazy" src="https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${c}_0.jpg" onerror="this.style.visibility='hidden'">`;
function trackHtml() {
  const { champs, counts } = sliderChamps();
  if (!champs.length) return `<p class="small muted ctrack-empty">No champion starts with “${esc(trainQ)}”.</p>`;
  if (!champs.includes(trainChamp)) trainChamp = champs[0];
  return champs.map((c) => `<button class="citem card ${c === trainChamp ? 'on' : ''}" data-champ="${c}" aria-pressed="${c === trainChamp}">${portrait(c)}<span>${champName(c)}</span><small>${counts[c] ? `${counts[c]} games` : ''}</small></button>`).join('');
}
/** The bar on top: role filter and search, the slider (most played first), then the role and the lock. */
function pickBar() {
  const track = trackHtml();
  return `<section class="pick-bar" aria-label="Your next game">
    <p class="pick-title"><b>Your 10 most played champions</b> <span class="small muted">· every other champion is in <a href="#/intel">Intelligence</a></span></p>
    <div class="carousel cards"><button class="cnav" data-cstep="-1" aria-label="Previous champion">‹</button><div class="ctrack" id="ctrack">${track}</div><button class="cnav" data-cstep="1" aria-label="Next champion">›</button></div>
    <div id="pick-act">${pickAct()}</div>
  </section>`;
}
/** The filters rebuild only the slider; the champion under it changes if it is filtered out. */
function bindFilters() {
  const rebuild = () => {
    const before = trainChamp;
    $('#ctrack').innerHTML = trackHtml();
    if (trainRoleF) trainRole = trainRoleF;
    bindSlider();
    if (trainChamp !== before || trainRoleF) { trainRole = trainRoleF || null; pickChamp(trainChamp, trainRoleF || null); }
  };
  app.querySelectorAll('[data-rolef]').forEach((b) => (b.onclick = () => { trainRoleF = b.dataset.rolef; app.querySelectorAll('[data-rolef]').forEach((x) => x.classList.toggle('on', x.dataset.rolef === trainRoleF)); rebuild(); }));
  const q = $('#champ-q');
  if (q) q.oninput = () => { trainQ = q.value; rebuild(); };
}
/** Under the slider: the role, what locking does, and what is waiting. */
function pickAct() {
  const roles = Object.keys(ROLES).filter((r) => D.pairs[`${r}|${trainChamp}`]);
  const mostRole = historyMains().find((m) => splitPair(m.pair).champ === trainChamp);
  if (!trainRole || !roles.includes(trainRole)) trainRole = mostRole ? splitPair(mostRole.pair).role : roles[0];
  const pair = `${trainRole}|${trainChamp}`;
  return `<div class="pick-act"><div class="chips">${roles.map((r) => `<button class="chip ${r === trainRole ? 'on' : ''}" data-trole="${r}">${ROLES[r]}</button>`).join('')}</div>
      </div>
    <p class="pick-help">${TERMS.training}</p>`;
}
// ---------- LP ----------
const lpOf = (net) => net * LP_PER_GAME;
const lpText = (net) => `${net > 0 ? '+' : net < 0 ? '−' : '±'}${Math.abs(lpOf(net))} LP`;
/** A champion's numbers in one figure: the mean gap to the tier over every number (negative is better). */
const meanSev = (ms) => (ms.length ? avg(ms.map((x) => x.sev)) : 0);
// ---------- build paths ----------
let trainSeg = 'all';
const SEG_NAMES = { all: 'All games', 'c:Tank': 'vs tanks', 'c:Fighter': 'vs fighters', 'c:Mage': 'vs mages', 'c:Assassin': 'vs assassins', 'c:Marksman': 'vs marksmen', 'c:Support': 'vs supports', 'd:AP': 'vs magic damage', 'd:AD': 'vs physical damage' };
/** The most built paths for this pick, by lane opponent type: first item, first three items, boots. */
function pathBlock(pair, all) {
  const T = window.TRAINING, segs = T?.paths?.[pair];
  if (!segs?.all) return '';
  if (!segs[trainSeg]) trainSeg = 'all';
  const b = segs[trainSeg], champ = champName(splitPair(pair).champ);
  const name = (id) => esc(T.items[id]?.[0] || id);
  const list = (o, of) => Object.entries(o).map(([k, c]) => ({ k, n: c[0], w: c[1] / c[0], share: c[0] / of, min: c[2] })).filter((x) => x.n >= 10).sort((p, q) => q.n - p.n); // object keys that are numbers come back in numeric order
  const firsts = list(b.first, b.n), paths = list(b.path, b.n), boots = list(b.boots, b.n);
  // 'Wins most' only when it beats the most built option by 2 points or more.
  const bestW = (xs) => { const t = xs.filter((x) => x.n >= 30).sort((p, q) => q.w - p.w)[0]; return t && xs[0] && (t === xs[0] || t.w >= xs[0].w + 0.02) ? t : null; };
  const tagBest = (xs) => { const t = bestW(xs); return (x) => (t && x === t && xs.length > 1 ? '<em class="best">wins most</em>' : ''); };
  const tf = tagBest(firsts), tp = tagBest(paths), tb = tagBest(boots);
  // Yours in the same games: the first three completed items of each of your games with a timeline.
  const cls = T.classes || {};
  const mineGames = all.filter((g) => g.opp && (trainSeg === 'all' || (trainSeg.startsWith('c:') && cls[g.opp] === trainSeg.slice(2)))).map(tlOf).filter(Boolean);
  const myPaths = {};
  for (const t of mineGames) { const done = [...new Set(t.buys.filter(([, id]) => T.items[id]?.[1] === 'item').map(([, id]) => id))].slice(0, 3); if (done.length === 3) { const k = done.join('>'); myPaths[k] = (myPaths[k] || 0) + 1; } }
  const myTop = Object.entries(myPaths).sort((p, q) => q[1] - p[1])[0];
  const row = (x, icons, extra) => `<div class="prow">${icons}<span class="pshare"><b>${pct(x.share)}</b><small>${x.n.toLocaleString('en-GB')} games</small></span><span class="pwin ${x.w >= 0.53 ? 'up' : x.w <= 0.47 ? 'down' : ''}"><b>${pct(x.w)}</b><small>won</small></span>${extra || ''}</div>`;
  const ic = (id) => `<span class="pitem">${itemIcon(id)}<span>${name(id)}</span></span>`;
  return `<section class="cv-path"><header class="panel-head"><div><p class="eyebrow">Build path · every tier, recent patches</p><h3>How ${champ} players build, by lane opponent</h3></div></header>
    <div class="chips">${Object.keys(SEG_NAMES).filter((k) => segs[k]).map((k) => `<button class="chip ${k === trainSeg ? 'on' : ''}" data-seg="${k}">${SEG_NAMES[k]} <span class="muted">${segs[k].n.toLocaleString('en-GB')}</span></button>`).join('')}</div>
    <div class="path-grid">
      <div><h4>First item</h4>${firsts.slice(0, 3).map((x) => row(x, ic(x.k), tf(x))).join('') || '<p class="small muted">Too few games.</p>'}</div>
      <div><h4>Boots</h4>${boots.slice(0, 2).map((x) => row(x, ic(x.k), `<span class="pmin"><b>${x.min ? `${Math.floor(x.min)}:${String(Math.round((x.min % 1) * 60)).padStart(2, '0')}` : '—'}</b><small>bought at</small></span>${tb(x)}`)).join('') || '<p class="small muted">Too few games.</p>'}</div>
      <div class="wide"><h4>First three items</h4>${paths.slice(0, 3).map((x) => row(x, `<span class="ppath">${x.k.split('>').map((id) => itemIcon(id)).join('<i>›</i>')}</span>`, tp(x))).join('') || '<p class="small muted">Too few games with three completed items.</p>'}
        ${myTop ? `<p class="small mine-path"><b>Yours, most often:</b> <span class="ppath">${myTop[0].split('>').map((id) => itemIcon(id)).join('<i>›</i>')}</span> in ${myTop[1]} of ${mineGames.length} games${trainSeg !== 'all' ? ` ${SEG_NAMES[trainSeg]}` : ''}.</p>` : ''}</div>
    </div>
    <p class="small muted">"Wins most": the highest win rate among the options with at least 30 games. It describes the games where they were built; per matchup and by minute comes with the production key.</p></section>`;
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
  return `<section class="champ-view" aria-label="${pairLabel(pair)}" style="--splash:url('https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${trainChamp}_0.jpg')">
    <header class="cv-head">${icon(trainChamp, 'champ lg')}<div><p class="eyebrow">${label} · ${games.length} game${games.length > 1 ? 's' : ''}</p><h2>${pairLabel(pair)}</h2></div>
      <div class="cv-res"><b class="${net > 0 ? 'up' : net < 0 ? 'down' : ''}">${wins}W ${games.length - wins}L</b><small>${lpText(net)} · estimate</small></div>
      <div class="chips">${[[30, '30 days'], [90, '3 months']].map(([d, n]) => `<button class="chip ${trainDays === d ? 'on' : ''}" data-tdays="${d}">${n}</button>`).join('')}</div></header>
    <div class="strip" aria-label="Results, oldest first">${games.map((g) => { const s = signedOf(g); return `<a class="sq ${g.win ? 'w' : 'l'}" href="${s ? `#/train/game/${s.id}` : `#/train/match/${g.id}`}" title="${day(g.start)} · ${g.win ? 'Win' : 'Loss'}${g.opp ? ` vs ${champName(g.opp)}` : ''} · ${g.k}/${g.d}/${g.a}"></a>`; }).join('')}</div>
    <div class="cv-grid">
      <div class="cv-main">
        ${top ? `<div class="priority"><p class="eyebrow">Priority</p><h3>${top.fix}</h3><p><b class="down">${top.f(top.v)}</b> · ${top.name} · average ${tn} ${champ} ${top.f(top.ref)}${wordsOf(top) ? ` · <b>${wordsOf(top)}</b>` : ''}</p><p class="small muted">${top.tip}${top.k === 'd14' && cost ? ` ${tn} ${champ} players with no death before minute 14 win ${cost.none}%; with 2 or more, ${cost.two}%.` : ''}</p></div>`
          : (meanSev(ms) < -0.1 && net > 0 ? `<div class="priority calm"><p class="eyebrow">One of your best picks</p><h3>Above the average ${tn} ${champ}</h3><p>Better on ${ms.filter((x) => x.sev <= -0.5).length} of ${ms.length} numbers, ${lpText(net)} over the ${label}. <b>To climb, play it more.</b></p></div>` : `<div class="priority calm"><p class="eyebrow">Priority</p><h3>Nothing clearly below your tier</h3><p class="small muted">Over the ${label}, every number is close to or above the average ${tn} ${champ}.</p></div>`)}
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
    ${deathsBlock(pair, all)}
    ${setupBlock(pair, all)}
    ${buildCompare(pair, all)}
    <p class="to-intel"><a href="#/intel/${encodeURIComponent(splitPair(pair).champ)}/${splitPair(pair).role}">Every build, rune and matchup of ${pairLabel(pair)} in Intelligence ›</a></p>
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
// ---------- improvement and the progress bar ----------
// Every ranked game is read against the player's usual: the same champion and role over the whole history (10 or
// more other games), else the same role. A game's improvement is the mean gap to that usual over every number, in
// "games of progress" (about ±1 for a usual game, at most ±1.5). In a training contest the points also depend on
// the other 19: half your own improvement, half how far it is above or below the contest's average.
const round1 = (x) => Math.round(x * 10) / 10;
const clampU = (x) => Math.max(-1.5, Math.min(1.5, x));
let impModel = null;
/** A game's numbers as plain values (the lane ones need its timeline). */
function gameValues(h) {
  const t = tlOf(h), role = splitPair(h.pair).role, out = {};
  for (const m of METRICS) { if (m.noRole?.includes(role)) continue; const v = m.get(h, t); if (v != null && Number.isFinite(v)) out[m.k] = v; }
  return out;
}
function improvementModel() {
  const all = rankedHistory(), key = `${all.length}:${!!window.TRAINING}`;
  if (impModel?.key === key) return impModel;
  const vals = new Map(all.map((h) => [h.id, gameValues(h)]));
  const sums = {}, counts = {};
  const group = (h) => [`p:${h.pair}`, `r:${splitPair(h.pair).role}`];
  for (const h of all) for (const g of group(h)) {
    counts[g] = (counts[g] || 0) + 1;
    for (const [k, v] of Object.entries(vals.get(h.id))) { const s = ((sums[g] ||= {})[k] ||= [0, 0]); s[0] += v; s[1]++; }
  }
  const raw = new Map();
  for (const h of all) {
    const [gp, gr] = group(h), g = counts[gp] - 1 >= 10 ? gp : counts[gr] - 1 >= 10 ? gr : null;
    if (!g) { raw.set(h.id, null); continue; }
    const xs = [];
    for (const [k, v] of Object.entries(vals.get(h.id))) { const s = sums[g][k]; if (!s || s[1] < 3) continue; const ref = (s[0] - v) / (s[1] - 1); xs.push(((v - ref) * MET[k].better) / MET[k].scale); }
    raw.set(h.id, xs.length ? avg(xs) : null);
  }
  const rs = [...raw.values()].filter((x) => x != null);
  impModel = { key, raw, sd: Math.sqrt(avg(rs.map((x) => x * x))) || 1, vals, sums, counts };
  return impModel;
}
/** What made a game better or worse than the player's usual: each number against the same champion and role
 *  (or the role, with fewer than 10 other games), best first. */
function improvementParts(h) {
  const m = improvementModel(), gp = `p:${h.pair}`, gr = `r:${splitPair(h.pair).role}`;
  const g = (m.counts[gp] || 0) - 1 >= 10 ? gp : (m.counts[gr] || 0) - 1 >= 10 ? gr : null;
  if (!g) return { by: null, parts: [] };
  const parts = Object.entries(m.vals.get(h.id) || {}).map(([k, v]) => { const s = m.sums[g][k]; if (!s || s[1] < 3) return null; const ref = (s[0] - v) / (s[1] - 1); return { m: MET[k], v, ref, z: ((v - ref) * MET[k].better) / MET[k].scale }; }).filter(Boolean).sort((a, b) => b.z - a.z);
  return { by: g === gp ? pairLabel(h.pair) : `${ROLES[splitPair(h.pair).role]} games`, parts };
}
/** A ranked game's improvement over the player's usual, in games of progress. */
const improvementOf = (h) => { const m = improvementModel(), r = m.raw.get(h.id); return r == null ? null : round1(clampU(r / m.sd)); };
/** Your entries in training contests take the improvement of their game, once the timelines are in. */
function syncContests() {
  if (!window.TRAINING) return;
  for (const c of Object.values(S.imp)) for (const e of c.entries) {
    if (!e.you || !e.gid) continue;
    const g = S.games.find((x) => x.id === e.gid), h = g && historyGame(g), u = h ? improvementOf(h) : null;
    if (u != null) e.total = u;
  }
}
/** Points a contest game adds to the bar: half your improvement, half how far it is from the other 19. */
function contestPoints(c, e) {
  const others = c.entries.filter((x) => x !== e && x.total != null);
  const field = others.length ? avg(others.map((x) => x.total)) : 0;
  return { pts: round1(clampU(0.5 * e.total + 0.5 * (e.total - field))), field: round1(field) };
}
const REWARDS = [['review', 'A coach reviews one of your games', 5], ['merch', 'Skybreak merch', 8], ['coaching', 'One hour of coaching', 12], ['tryout', 'A try-out for a Skybreak team', 30]];
/** The bar over time: every contest game moves it, rewards spend it; it never goes below zero. */
function progressLedger() {
  const steps = [];
  for (const c of Object.values(S.imp)) for (const e of c.entries) if (e.you && e.total != null) steps.push({ at: e.at, c, e, ...contestPoints(c, e) });
  for (const s of S.spent || []) steps.push({ at: s.at, spend: s });
  steps.sort((a, b) => a.at - b.at);
  let bal = 0;
  for (const s of steps) { bal = Math.max(0, bal + (s.spend ? -s.spend.cost : s.pts)); s.bal = round1(bal); }
  return { bal: round1(bal), steps };
}
const REWARD_SHORT = { review: 'Coach review', merch: 'Merch', coaching: 'Coaching', tryout: 'Team try-out' };
/** Training's first section: on the left the one thing to do now, on the right the progress it earns, as a road of rewards. */
function progressPanel() {
  const { bal, steps } = progressLedger(), games = steps.filter((s) => !s.spend);
  const last = games.slice(-8).reverse();
  const next = REWARDS.find((r) => r[2] > bal);
  // Rewards evenly spaced along the road; the bar moves between one and the next in proportion.
  const stops = [0, ...REWARDS.map((r) => r[2])], pos = stops.map((_, i) => 3 + (i * 94) / (stops.length - 1));
  const at = (v) => { const k = stops.findIndex((x, i) => i > 0 && v <= x); if (k < 0) return '97%'; return `${pos[k - 1] + ((v - stops[k - 1]) / (stops[k] - stops[k - 1])) * (pos[k] - pos[k - 1])}%`; };
  return `<section class="tprog" aria-label="Training contest and your progress">
    <div class="tp-act"><header><p class="eyebrow">Free · 20 players</p><h2>Training contest</h2></header>${trainingStep('*')}</div>
    <div class="tp-prog">
      <header><div><p class="eyebrow">Your progress</p><strong>${bal.toFixed(1)}</strong><small>${games.length} training contest game${games.length === 1 ? '' : 's'}</small></div>
        <p class="tp-next">${next ? `<b>${round1(next[2] - bal)}</b> more for <b>${REWARD_SHORT[next[0]].toLowerCase()}</b>` : 'Every reward is open'}</p></header>
      <div class="tp-road"><div class="tp-rail"><i style="width:${at(bal)}"></i><span class="tp-you" style="left:${at(bal)}" title="You: ${bal.toFixed(1)}"></span></div>
        ${REWARDS.map(([id, name, cost], i) => `<button class="tp-node ${bal >= cost ? 'ok' : ''} ${i % 2 ? 'low' : ''}" style="left:${at(cost)}" data-spend="${id}" ${bal >= cost ? '' : 'disabled'} title="${esc(name)} · ${cost} points${bal >= cost ? ' · click to use' : ` · ${round1(cost - bal)} more to go`}"><i>${cost}</i><span>${REWARD_SHORT[id]}</span></button>`).join('')}</div>
      <div class="tp-last"><span>Last games</span>${last.map((s) => `<a class="pg-step ${s.pts > 0 ? 'up' : s.pts < 0 ? 'down' : ''}" href="#/contests/t/${s.c.id}" title="Your improvement ${signed(s.e.total)} · contest average ${signed(s.field)}${s.c.state === 'open' ? ' · provisional' : ''}">${icon(splitPair(s.e.pair).champ)}<b>${s.pts > 0 ? '+' : s.pts < 0 ? '−' : '±'}${Math.abs(s.pts).toFixed(1)}</b></a>`).join('') || '<span class="small muted">No training contest game yet.</span>'}</div>
      <details class="pg-how"><summary>How it moves</summary><p class="small">Every ranked game you play is compared with your usual game with the same champion and role, over your whole history. A game you enter in a training contest adds half of your improvement and half of how much you improved above or below the other 19. A usual game moves the bar by about one point; a very good or very bad one by one and a half at most. Rewards spend it; it never goes below zero. Points are earned only, never bought. <span class="muted">Demo numbers: the other players are simulated.</span></p></details>
    </div>
  </section>`;
}
function spendReward(id) {
  const r = REWARDS.find((x) => x[0] === id), { bal } = progressLedger();
  if (!r || bal < r[2]) return;
  (S.spent ||= []).push({ id, cost: r[2], at: S.now });
  save(); toast(`Demo: ${r[1].toLowerCase()} redeemed for ${r[2]} progress.`);
}
// ---------- a grade per game, and what decided it ----------
/** A game's grade: half its improvement on your usual, half its gap to the tier's same champion. */
function gameGrade(h) {
  const own = improvementOf(h);
  const gm = Object.entries(gameMetrics(h)).map(([k, x]) => ({ ...MET[k], ...x }));
  const vsTier = gm.length ? clampU(-avg(gm.map((x) => x.sev))) : null;
  const parts = [own, vsTier].filter((v) => v != null);
  if (!parts.length) return null;
  const s = avg(parts);
  const letter = s >= 1.25 ? 'S' : s >= 0.5 ? 'A' : s >= -0.5 ? 'B' : s >= -1.25 ? 'C' : 'D'; // about 1 in 10 games is S or D
  // What decided it: in a loss the number furthest below the tier, in a win the one furthest above.
  const pickM = h.win ? gm.filter((x) => x.sev <= -0.5).sort((a, b) => a.sev - b.sev)[0] : gm.filter((x) => x.sev >= 0.5).sort((a, b) => b.sev - a.sev)[0];
  const tn = tnT();
  const decided = pickM ? `${h.win ? 'Won on' : 'Lost on'} ${pickM.name.toLowerCase().replace(/^cs/, 'CS').replace(/^xp/, 'XP')}: ${pickM.f(pickM.v)}, ${tn} ${pickM.f(pickM.ref)}` : h.win ? 'A steady win: close to your tier everywhere' : 'No single number decided it';
  return { s: round1(s), letter, decided, own, vsTier: vsTier == null ? null : round1(vsTier) };
}
const gradeBadge = (gr) => (gr ? `<b class="grade g-${gr.letter}" title="Grade ${gr.letter}: ${gr.own != null ? `${signed(gr.own)} on your usual, ` : ''}${gr.vsTier != null ? `${signed(gr.vsTier)} on your tier` : ''}">${gr.letter}</b>` : '');
// ---------- runes, spells and skills: yours and the tier's (Intelligence files) ----------
const intelCache = {};
let intelIndex = null, intelIndexLoad = 'idle';
/** Loads the Intelligence index and one champion's file; true when both are in. */
function withIntel(pair, then) {
  if (intelIndexLoad === 'idle') { intelIndexLoad = 'loading'; fetch('intel/index.json').then((r) => (r.ok ? r.json() : null)).then((j) => { intelIndex = j; intelIndexLoad = j ? 'ready' : 'failed'; then(); }).catch(() => { intelIndexLoad = 'failed'; then(); }); }
  if (pair && !(pair in intelCache)) { intelCache[pair] = undefined; fetch(`intel/${pair.replace('|', '_')}.json`).then((r) => (r.ok ? r.json() : null)).then((j) => { intelCache[pair] = j; then(); }).catch(() => { intelCache[pair] = null; then(); }); }
  return intelIndexLoad === 'ready' && (!pair || intelCache[pair] !== undefined);
}
const tierGroupOf = (t) => (['GRANDMASTER', 'CHALLENGER'].includes(t) ? 'MASTER' : t in GROUP_NAMES ? t : 'ALL');
const GROUP_NAMES = { ALL: 'All tiers', IRON: 'Iron', BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', PLATINUM: 'Platinum', EMERALD: 'Emerald', DIAMOND: 'Diamond', MASTER: 'Master and above' };
const runeIcon = (id) => (intelIndex?.runeIcons?.[id] ? `<img class="rune" alt="${esc(intelIndex.runes[id] || '')}" title="${esc(intelIndex.runes[id] || '')}" src="https://ddragon.leagueoflegends.com/cdn/img/${intelIndex.runeIcons[id]}" loading="lazy">` : '');
const spellIcon = (key) => { const s = intelIndex?.spells?.[key]; return s ? `<img class="spell" alt="${esc(s[0])}" title="${esc(s[0])}" src="https://ddragon.leagueoflegends.com/cdn/${D.ddragon}/img/spell/${s[1]}.png" loading="lazy">` : ''; };
function setupBlock(pair, all) {
  const again = () => { if ((location.hash || '#/train') === '#/train') keepBelow(); };
  if (!withIntel(pair, again)) return intelIndexLoad === 'failed' ? '' : `<section class="cv-setup"><p class="small muted">Loading runes and spells…</p></section>`;
  const file = intelCache[pair];
  const ts = all.slice(-60).map((g) => ({ g, t: tlOf(g) })).filter((x) => x.t);
  if (!ts.length) return '';
  const grp = file?.groups?.[tierGroupOf(P().tier)] || file?.groups?.ALL;
  const count = (f) => { const o = {}; for (const { g, t } of ts) { const k = f(t); if (!k) continue; const c = (o[k] ||= [0, 0]); c[0]++; if (g.win) c[1]++; } return Object.entries(o).sort((a, b) => b[1][0] - a[1][0]); };
  const myKey = count((t) => t.runes && t.runes.split('.')[0]), mySpells = count((t) => t.spells), myPrio = count((t) => t.prio), myFirst = count((t) => t.first3);
  const n = ts.length, tn = tnT();
  const theirs = (arr) => (arr && arr[0] ? { k: arr[0][0], share: arr[0][1] / grp.n, w: arr[0][2] / arr[0][1], n: arr[0][1] } : null);
  const tKey = theirs(grp?.keystone), tSp = theirs(grp?.spells), tPr = theirs(grp?.skills), tF = theirs(grp?.first3);
  const share = (x) => (x ? `${pct(x[1][0] / n)} of your games, won ${pct(x[1][1] / x[1][0])}` : '—');
  const row = (label, mine, them, show) => `<div class="su-row ${mine && them && String(mine[0]) !== String(them.k) ? 'diff' : ''}"><span class="su-l">${label}</span><span class="su-c">${mine ? show(mine[0]) : '—'}<small>${share(mine)}</small></span><span class="su-c">${them ? show(them.k) : '<span class="muted">no data</span>'}<small>${them ? `${pct(them.share)} of ${tn} players · won ${pct(them.w)}` : ''}</small></span></div>`;
  const skill = (k) => `<b class="skills">${esc(k)}</b>`;
  return `<section class="cv-setup"><header class="panel-head"><div><p class="eyebrow">Runes, spells and skills · your last ${n} games</p><h3>Your setup against ${tn} ${champName(splitPair(pair).champ)} players</h3></div><span class="small muted">${grp ? `${GROUP_NAMES[tierGroupOf(P().tier)] || 'All tiers'}, ${grp.n.toLocaleString('en-GB')} games` : ''} · amber rows: you differ from the most common choice</span></header>
    <div class="su-head"><span></span><span>You</span><span>${tn} players</span></div>
    ${row('Keystone', myKey[0], tKey, (k) => `${runeIcon(k)}<b>${esc(intelIndex.runes[k] || k)}</b>`)}
    ${row('Summoner spells', mySpells[0], tSp, (k) => `${String(k).split('.').map(spellIcon).join('')}<b>${String(k).split('.').map((x) => intelIndex.spells[x]?.[0] || x).join(' + ')}</b>`)}
    ${row('Skill priority', myPrio[0], tPr, skill)}
    ${row('First three levels', myFirst[0], tF, skill)}</section>`;
}
// ---------- early deaths ----------
function deathsBlock(pair, all) {
  const ts = all.map(tlOf).filter(Boolean);
  const ds = ts.flatMap((t) => t.early || []);
  if (ts.length < 5 || !ds.length) return '';
  const by = { jungle: 0, lane: 0, others: 0 }; let deep = 0;
  for (const [, b, d] of ds) { by[b]++; deep += d; }
  const per = ds.length / ts.length, j = by.jungle / ds.length, l = by.lane / ds.length, o = by.others / ds.length, dp = deep / ds.length;
  const tip = j >= 0.4 ? 'Most of your early deaths involve the enemy jungler: ward the river before the 3-minute mark and play towards your tower when the jungler is not on the map.' : l >= 0.4 ? 'Most of your early deaths are your lane opponent alone: trade when your spells are up and theirs are not, and respect their level 2, 3 and 6.' : 'Your early deaths come from fights with several enemies: join only when your jungler or mid is there too.';
  return `<section class="cv-deaths"><header class="panel-head"><div><p class="eyebrow">Before minute 14 · ${ts.length} games</p><h3>How you die early</h3></div><span class="small muted">${per.toFixed(1)} deaths a game before minute 14</span></header>
    <div class="dbar" role="img" aria-label="Early deaths: ${pct(j)} with the jungler, ${pct(l)} the lane opponent alone, ${pct(o)} other fights"><i class="dj" style="width:${j * 100}%"></i><i class="dl" style="width:${l * 100}%"></i><i class="do" style="width:${o * 100}%"></i></div>
    <div class="dlegend"><span><i class="dj"></i>Jungler involved <b>${pct(j)}</b></span><span><i class="dl"></i>Lane opponent alone <b>${pct(l)}</b></span><span><i class="do"></i>Other fights <b>${pct(o)}</b></span><span class="dp">Beyond the middle of the map <b class="${dp >= 0.5 ? 'down' : ''}">${pct(dp)}</b></span></div>
    <p class="small tipline">${tip}${dp >= 0.5 ? ' And more than half happen past the middle of the map: you are pushing without vision.' : ''}</p></section>`;
}
// ---------- habits ----------
function habitsBlock() {
  const all = rankedHistory();
  if (all.length < 40) return '';
  const wr = (gs) => (gs.length ? gs.filter((g) => g.win).length / gs.length : null);
  // sessions: a gap of 45 minutes or more starts a new one
  let prev = null, inSession = 0, streak = 0;
  const tagged = all.map((g) => {
    const gap = prev ? (g.start - (prev.start + prev.minutes * 60e3)) / 60e3 : Infinity;
    inSession = gap >= 45 ? 1 : inSession + 1;
    const afterLosses = gap >= 45 * 8 ? 0 : streak; // a long break resets the streak
    streak = g.win ? 0 : afterLosses + 1;
    prev = g;
    return { g, inSession, afterLosses };
  });
  const h = (g) => new Date(g.start).getHours();
  const groups = [
    ['When you play', [['Morning', (x) => h(x.g) >= 6 && h(x.g) < 12], ['Afternoon', (x) => h(x.g) >= 12 && h(x.g) < 18], ['Evening', (x) => h(x.g) >= 18 && h(x.g) < 23], ['Night', (x) => h(x.g) >= 23 || h(x.g) < 6]]],
    ['Game of the session', [['1st', (x) => x.inSession === 1], ['2nd-3rd', (x) => x.inSession >= 2 && x.inSession <= 3], ['4th or later', (x) => x.inSession >= 4]]],
    ['After losses in a row', [['After a win or a break', (x) => x.afterLosses === 0], ['After 1 loss', (x) => x.afterLosses === 1], ['After 2 or more', (x) => x.afterLosses >= 2]]],
    ['Side of the map', [['Blue side', (x) => tlOf(x.g)?.side === 100], ['Red side', (x) => tlOf(x.g)?.side === 200]]],
  ];
  const base = wr(all);
  const cells = groups.map(([title, opts]) => ({ title, rows: opts.map(([name, f]) => { const gs = tagged.filter(f).map((x) => x.g); return { name, n: gs.length, w: wr(gs) }; }) }));
  // The clearest gap, with enough games on both sides, says what to change.
  const worst = cells.flatMap((c) => c.rows.map((r) => ({ ...r, title: c.title }))).filter((r) => r.n >= 25 && r.w != null).sort((a, b) => a.w - b.w)[0];
  const say = worst && worst.w <= base - 0.05 ? (worst.title === 'After losses in a row' ? `After ${worst.name.replace('After ', '').toLowerCase()} you win ${pct(worst.w)} (${worst.n} games), against ${pct(base)} overall: stop after two losses.` : worst.title === 'Game of the session' ? `In the ${worst.name} game of a session you win ${pct(worst.w)} (${worst.n} games), against ${pct(base)} overall: shorter sessions.` : `${worst.title === 'When you play' ? 'In the' : 'On the'} ${worst.name.toLowerCase()} you win ${pct(worst.w)} (${worst.n} games), against ${pct(base)} overall.`) : null;
  const recent = all.slice(-20), rt = totals(recent), st = totals(all);
  const cmp = [['Win rate', rt.win, st.win, pct, 1], ['Deaths', rt.d, st.d, (x) => x.toFixed(1), -1], ['CS per minute', rt.cspm, st.cspm, (x) => x.toFixed(1), 1], ['Kill participation', rt.kp, st.kp, pct, 1]];
  return `<section class="intel-block habits"><header class="panel-head"><div><p class="eyebrow">Every champion · ${all.length} games since ${monthYear(all[0].start)}</p><h2>Your habits</h2></div></header>
    ${say ? `<p class="habit-say"><b>${say}</b></p>` : ''}
    <div class="habit-grid">${cells.map((c) => `<div class="habit"><h4>${c.title}</h4>${c.rows.map((r) => `<div class="hrow"><span>${r.name}</span><span class="hbar"><i class="${r.w == null ? '' : r.w >= base + 0.03 ? 'up' : r.w <= base - 0.03 ? 'down' : ''}" style="width:${r.w == null ? 0 : r.w * 100}%"></i><u style="left:${base * 100}%"></u></span><b>${r.w == null ? '—' : pct(r.w)}</b><small>${r.n}</small></div>`).join('')}</div>`).join('')}
      <div class="habit"><h4>Last 20 games against the season</h4>${cmp.map(([n2, a, b, f, dir]) => `<div class="hrow cmp"><span>${n2}</span><b class="${(a - b) * dir > 0.01 ? 'up' : (a - b) * dir < -0.01 ? 'down' : ''}">${f(a)}</b><small>season ${f(b)}</small></div>`).join('')}</div></div>
    <p class="small muted">Bars: win rate; the tick is your overall ${pct(base)}. Small numbers: games behind each line.</p></section>`;
}
// ---------- match history ----------
function historyRow(h) {
  const g = signedOf(h);
  return `<a class="match-row trow" href="${g ? `#/train/game/${g.id}` : `#/train/match/${h.id}`}">${icon(h.champ)}<span class="match-pair"><b>${gradeBadge(gameGrade(h))} ${pairLabel(h.pair)}${h.opp ? ` <span class="muted">vs ${champName(h.opp)}</span>` : ''}</b><small class="decided">${gameGrade(h)?.decided ?? ''}</small><small>${day(h.start)} · ${Math.round(h.minutes)} min · ${h.k}/${h.d}/${h.a}${g ? ` · <span class="sky-t">${g.kind === 'contest' ? 'prize contest' : 'training contest'}</span>` : ''}</small></span><span class="match-result ${h.win ? 'win' : 'loss'}">${h.win ? 'Win' : 'Loss'}</span><span class="tpos"><b>${(h.cs / h.minutes).toFixed(1)}</b><small>CS/min</small></span><span class="tchips">${metricTags(h, 2, 1)}</span><span class="match-open">›</span></a>`;
}
function matchHistory() {
  const games = rankedHistory().filter((g) => g.start >= S.now - trainDays * DAY).reverse();
  const by = new Map();
  for (const g of games) by.set(g.pair, [...(by.get(g.pair) || []), g]);
  const groups = [...by].map(([pair, gs]) => { const w = gs.filter((g) => g.win).length; return { pair, gs, w, net: 2 * w - gs.length }; }).sort((a, b) => b.gs.length - a.gs.length);
  const totalNet = groups.reduce((s, x) => s + x.net, 0), sel = `${trainRole}|${trainChamp}`;
  const body = trainMode === 'champ'
    ? `<div class="hist-grid">${groups.map((c) => `<button class="hcard ${c.pair === sel ? 'on' : ''}" data-pick="${c.pair}">${icon(splitPair(c.pair).champ)}<span class="hname"><b>${pairLabel(c.pair)}</b><small>${c.gs.length} game${c.gs.length > 1 ? 's' : ''}</small></span><span class="hnet ${c.net > 0 ? 'up' : c.net < 0 ? 'down' : ''}"><b>${lpText(c.net)}</b><small>${c.w}W ${c.gs.length - c.w}L</small></span><span class="strip mini">${c.gs.slice(0, 12).reverse().map((g) => `<i class="sq ${g.win ? 'w' : 'l'}"></i>`).join('')}</span></button>`).join('')}</div>`
    : `<div class="match-list">${games.slice(0, 40).map(historyRow).join('')}</div>`;
  return `<section class="intel-block hist"><header class="panel-head"><div><p class="eyebrow">Match history · ${trainDays === 30 ? 'last 30 days' : 'last 3 months'}</p><h2>${games.length} games · ${lpText(totalNet)}</h2></div><div class="chips">${[['champ', 'By champion'], ['date', 'By date']].map(([k, n]) => `<button class="chip ${trainMode === k ? 'on' : ''}" data-tmode="${k}">${n}</button>`).join('')}</div></header>
  ${body || '<p class="muted">No ranked games in this period.</p>'}
  <p class="small muted">${trainMode === 'champ' ? 'Pick a champion to open it above. ' : ''}LP is an estimate, about ${LP_PER_GAME} a game: Riot keeps no LP per game, so from now on we record it at every check.</p></section>`;
}
function bindTrain() {
  bindFilters();
  bindSlider();
  bindBelow();
}
/** The slider scrolls freely and snaps; the champion that stops in the centre is the one shown. */
let sliderTimer = 0;
function bindSlider() {
  const tr = $('#ctrack');
  clearTimeout(sliderTimer); // a pending choice from the list before a filter must not fire
  if (!tr) return;
  const items = [...tr.querySelectorAll('.citem')];
  if (!items.length) { tr.onscroll = null; return; }
  const centre = () => { const mid = tr.scrollLeft + tr.clientWidth / 2; let best = items[0], d = Infinity; for (const it of items) { const c = it.offsetLeft + it.offsetWidth / 2, x = Math.abs(c - mid); if (x < d) { d = x; best = it; } } return best; };
  const shade = () => { const mid = tr.scrollLeft + tr.clientWidth / 2, w = items[0]?.offsetWidth || 60; for (const it of items) it.style.setProperty('--d', Math.min(3, Math.abs(it.offsetLeft + it.offsetWidth / 2 - mid) / (w + 10)).toFixed(2)); };
  const on = items.find((it) => it.dataset.champ === trainChamp);
  if (on) tr.scrollLeft = on.offsetLeft - tr.clientWidth / 2 + on.offsetWidth / 2;
  shade();
  let raf = 0;
  tr.onscroll = () => {
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; shade(); });
    clearTimeout(sliderTimer);
    sliderTimer = setTimeout(() => { if (!items[0].isConnected) return; const c = centre(); if (c && c.dataset.champ !== trainChamp) pickChamp(c.dataset.champ); }, 140);
  };
  const go = (it) => it && tr.scrollTo({ left: it.offsetLeft - tr.clientWidth / 2 + it.offsetWidth / 2, behavior: 'smooth' });
  items.forEach((it) => (it.onclick = () => go(it)));
  app.querySelectorAll('[data-cstep]').forEach((b) => (b.onclick = () => { const i = items.indexOf(centre()); go(items[Math.max(0, Math.min(items.length - 1, i + Number(b.dataset.cstep)))]); }));
}
/** A new champion in the centre: only what is under the slider changes, so the slider never jumps. */
function pickChamp(champ, role = null) {
  trainChamp = champ; trainRole = role;
  $('#ctrack')?.querySelectorAll('.citem').forEach((it) => { const on = it.dataset.champ === champ; it.classList.toggle('on', on); it.setAttribute('aria-pressed', on); });
  refreshBelow();
}
function refreshBelow() {
  const list = improveList();
  $('#pick-act').innerHTML = pickAct();
  const below = $('#train-below');
  if (below) below.innerHTML = `${champView(list)}${trainNudge()}${habitsBlock()}${matchHistory()}`;
  bindBelow();
}
function bindBelow() {
  app.querySelectorAll('[data-trole]').forEach((b) => (b.onclick = () => { trainRole = b.dataset.trole; refreshBelow(); }));
  app.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => {
    const { role, champ } = splitPair(b.dataset.pick);
    const it = $('#ctrack')?.querySelector(`[data-champ="${champ}"]`), tr = $('#ctrack');
    pickChamp(champ, role);
    if (it && tr) tr.scrollTo({ left: it.offsetLeft - tr.clientWidth / 2 + it.offsetWidth / 2, behavior: 'smooth' });
    $('.pick-bar')?.scrollIntoView({ behavior: 'smooth' });
  }));
  app.querySelectorAll('[data-tmode]').forEach((b) => (b.onclick = () => { trainMode = b.dataset.tmode; keepBelow(); }));
  app.querySelectorAll('[data-tdays]').forEach((b) => (b.onclick = () => { trainDays = Number(b.dataset.tdays); keepBelow(); }));
  app.querySelectorAll('[data-seg]').forEach((b) => (b.onclick = () => { trainSeg = b.dataset.seg; keepBelow(); }));
  bindCurves();
}
const keepBelow = () => { const y = scrollY; refreshBelow(); scrollTo(0, y); };
const keepTrain = () => { const y = scrollY; viewTrain(); scrollTo(0, y); };
function lockPair(pair) {
  S.signups.push({ id: uid('S'), kind: 'training', ticket: 0, pair, picks: [], at: S.now, status: 'waiting' });
  save(); toast(pair === '*' ? 'Entered: now play a solo queue game, then check your games.' : `Entered: now play a solo queue game with ${pairLabel(pair)}, then check your games.`);
  const y = scrollY; render(); scrollTo(0, y);
}
function viewPastSignups() {
  const ended = S.signups.filter((s) => s.kind === 'training' && !active(s)).reverse();
  app.innerHTML = `<p class="back"><a href="#/contests/training">← Training contest</a></p><div class="route-title"><p class="eyebrow">Training contest</p><h1>Past entries</h1></div>${ended.length ? `<div class="list">${ended.map(signupRow).join('')}</div>` : '<p class="muted">None yet.</p>'}`;
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
  const headHtml = `<p class="back"><a href="#/train">← Training</a></p><header class="rep-head">${icon(champ, 'champ lg')}<div><p class="eyebrow">${base.kind === 'contest' ? 'Prize contest game' : base.kind === 'training' ? 'Training contest game' : 'Ranked game'} · ${when(base.start)}</p><h1>${pairLabel(pair)} <span class="${base.win ? 'w' : 'l'}">${base.win ? 'Win' : 'Loss'}</span></h1>
  <p class="small muted">${Math.round(base.minutes)} min${h ? ` · ${h.k}/${h.d}/${h.a} · ${h.cs} CS` : ''}${h?.opp ? ` · against ${champName(h.opp)}` : ''} · ${esc(base.note)} ${c ? `<a href="${c.kind === 'imp' ? `#/contests/t/${c.id}` : `#/contest/${c.id}`}">Contest #${num(c.id)} ›</a>` : ''}</p></div></header>`;
  if (!ready) { app.innerHTML = `${headHtml}<p class="muted">${trainLoad === 'failed' || statsLoad === 'failed' ? 'Could not load the game data.' : 'Loading the game…'}</p>`; return; }
  const t = tlOf(h), a = tierAvg(pair);
  const usualGames = rankedHistory().filter((x) => x.pair === pair && x.id !== h.id);
  const usual = usualGames.map(tlOf).filter(Boolean);
  const ums = usualGames.length >= 5 ? Object.fromEntries(groupMetrics(usualGames, false).map((x) => [x.k, x])) : {};
  const gm = Object.entries(gameMetrics(h)).map(([k, x]) => ({ ...MET[k], ...x })).sort((p, q) => q.sev - p.sev);
  const gr = gameGrade(h);
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
  ${gr ? `<section class="rep-grade"><b class="grade big g-${gr.letter}">${gr.letter}</b><div><strong>${esc(gr.decided)}</strong><small>Grade ${gr.letter}: ${gr.own != null ? `${signed(gr.own)} on your usual ${pairLabel(pair)}` : 'too few games for your usual'}${gr.vsTier != null ? `, ${signed(gr.vsTier)} on the average ${tn} ${cn}` : ''}. S is the best, D the worst.</small></div></section>` : ''}
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
    ${t.early?.length ? `<p class="small early-list"><b>Deaths before 14':</b> ${t.early.map(([m, by, deep]) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')} ${by === 'jungle' ? 'gank, the jungler involved' : by === 'lane' ? `${h.opp ? champName(h.opp) : 'your opponent'} alone` : 'a fight with several'}${deep ? ', past the middle of the map' : ''}`).join(' · ')}</p>` : ''}
    ${cost && t.d14 >= 2 ? `<p class="cost"><b>These early deaths cost games.</b> ${tn} ${cn} players with no death before minute 14 win ${cost.none}% of their games; with 2 or more, ${cost.two}%.</p>` : ''}
  </section>` : '<p class="small muted">No timeline for this game.</p>'}
  <section class="rep-rows"><header class="panel-head"><div><p class="eyebrow">Against the average ${tn} ${cn}</p><h2>${worse.length ? `${worse.length} thing${worse.length > 1 ? 's' : ''} went wrong` : 'Nothing clearly went wrong'}${better.length ? ` · ${better.length} went well` : ''}</h2></div><span class="gscale"><small>worse</small><small>${tn}</small><small>better</small></span></header>
    ${gm.map(mrow).join('')}
    ${worse[0] ? `<p class="small tipline"><b>${worse[0].fix}:</b> ${worse[0].tip}</p>` : ''}
    <p class="small muted">The tick is your usual ${pairLabel(pair)} over ${usualGames.length} other games.</p></section>
  ${t ? `<section class="rep-two">${teamsBlock(t, h)}${buildBlock(t)}</section>
  <details class="card tech allch"><summary><h3>More curves: gold, farm, damage</h3></summary><div class="curves">${['gold', 'cs', 'dmg'].map((k) => (t.cur[k]?.length ? lineChart(`rep-${h.id}-${k}`, k, series(k), t.deaths) : '')).join('')}</div></details>` : ''}
  ${g?.results ? `<section class="card goldcard"><h3>Your contest score · ${g.win ? 'win' : 'loss'} ${resultPts(g.win)} + 3 challenges = ${g.total} points</h3><div class="tablewrap"><table class="num"><tr><th>Pick</th><th>You</th><th>Line</th><th>Points</th></tr>${g.results.map((r) => `<tr><td>${CH[r.id].name} <span class="tag ${r.level}">${r.level}</span></td><td>${fmt(r.id, r.value)}</td><td>${fmt(r.id, r.hi)}</td><td>${r.full ? `<b>${r.points}</b> made it` : r.frac > 0 ? `<b>${r.points}</b> (${Math.round(r.frac * 100)}% of the way)` : '0'}</td></tr>`).join('')}</table></div></section>` : ''}
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
  return { me, rows, cls: '', text: `of ${of} · +${round1(above.total - me.total + 0.1).toFixed(1)} to move up` };
}
function viewImpContest(id) {
  const c = S.imp[id];
  if (!c) { app.innerHTML = '<p>Contest not found. <a href="#/contests/training">Contests</a></p>'; return; }
  syncContests();
  const st = standing(c), rows = st.rows, cp = contestPoints(c, st.me);
  app.innerHTML = `<p class="back"><a href="#/contests/training">← Training contest</a></p><div class="hello"><div><p class="eyebrow">Free · 20 training games · any tier · earns points</p><h1>Training contest #${num(c.id)}</h1>
  <p class="sub">${c.state === 'open' ? `Open: ${c.entries.length} of ${SEATS} games, provisional.` : `Finished ${day(c.closedAt)}.`} Ranked by improvement: each game against the usual game of whoever played it, with that champion and role. Riot IDs only. <span class="muted">Demo numbers: the formula is not final.</span></p></div>
  <div class="counter"><b>${c.entries.length}</b><span>of ${SEATS}</span></div></div>
  <div class="standing"><strong>${ord(st.me._place)}</strong><span>${st.text} · your improvement <b>${signed(st.me.total)}</b>, contest average ${signed(cp.field)}: <b class="${cp.pts >= 0 ? 'up' : 'down'}">${signed(cp.pts)} progress</b>${c.state === 'open' ? ' <span class="muted">· one game per contest: your next training game enters another one</span>' : ''}</span></div>
  <table class="lb"><tr class="head"><th>#</th><th>Player</th><th style="text-align:right">Improvement</th></tr>
  ${rows.map((e) => `<tr class="${e.you ? 'you' : ''}"><td><span class="place">${e._tie ? '=' : ''}${e._place}</span></td><td><div class="row nowrap">${icon(splitPair(e.pair).champ)}<div><b>${esc(e.name)}</b>${e.you ? ' <span class="tag sky">you</span>' : ''}<div class="small muted">${tierName(e.tier)} · ${pairLabel(e.pair)}</div></div></div></td><td class="pts"><b class="kpi">${signed(e.total)}</b></td></tr>`).join('')}</table>`;
}

// ---------- contest area ----------
const placeOf = (c) => { const me = ranked(c).find((e) => e.you); return me ? me._place : null; };
/** What a player gets back by place, as a share of the ticket: the one prize table of the app. */
const PRIZE_ROWS = [...PRIZE_X.slice(0, 14).map((x, i) => [ord(i + 1), x]), ['15th-20th', 0]];
function prizeTable() {
  return `<div class="tablewrap"><table class="num prizes"><tr><th>Place</th>${TICKETS.map((t) => `<th>${CONTEST_NAME[t]}<small>${euro(t * PRIZE_X.reduce((a, x) => a + x, 0))} in prizes</small></th>`).join('')}</tr>${PRIZE_ROWS.map(([n, x]) => `<tr class="${x > 1 ? 'top' : x === 1 ? 'back' : x > 0 ? 'part' : 'none'}"><td>${n}</td>${TICKETS.map((t) => `<td>${x ? euro2(t * x) : 'nothing'}</td>`).join('')}</tr>`).join('')}</table></div>`;
}
function viewLobby(arg = '') {
  if (needAccount()) return;
  if (arg.startsWith('t/')) return viewImpContest(arg.slice(2));
  if (arg === 'signups') return viewPastSignups();
  if (arg === 'training') return viewTrainingArea();
  const again = () => { if ((location.hash || '').startsWith('#/contests')) { const y = scrollY; viewLobby(arg); scrollTo(0, y); } };
  withTraining(again); withStats(again); syncContests();
  app.innerHTML = contestsBlock('area');
  if (arg === 'prize') { const el = $('.hc-two'); if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' })); }
}
let joinDraft = null;
function viewJoin(ticket) {
  if (needAccount()) return;
  if (!TICKETS.includes(ticket)) { location.hash = '#/contests'; return; }
  if (!S.verified) { S.afterVerify = `#/join/${ticket}`; location.hash = '#/verify'; return; }
  const tier = P().tier;
  if (!joinDraft) joinDraft = newDraft('contest', ticket); else joinDraft.ticket = ticket; // changing ticket keeps the champion and the challenges
  const d = joinDraft;
  const pp = pairPicker(d);
  const offers = offersOf(d.pair), r = rec();
  const pts = d.picks.reduce((a, x) => a + POINTS[x.level], 0);
  const slot = (i) => { const p = d.picks[i]; return `<div class="slot ${p ? 'full' : ''}"><span class="n">${i + 1}</span>${p ? `<b>${CH[p.id].name}</b> <span class="tag ${p.level}">${p.level}</span> <button class="x" data-rm="${i}" aria-label="Remove">×</button>` : '<span class="muted">empty</span>'}</div>`; };
  app.innerHTML = `<p class="back"><a href="#/contests">← Contests</a></p><div class="hello"><div><p class="eyebrow">Prize contest · 20 players</p><h1>${cName(ticket)}</h1><p class="join-sub">Ticket ${euro(ticket)} · ${euro(ticket * PRIZE_X.reduce((a, x) => a + x, 0))} in prizes for the first 14 places · <b>the last 6 win nothing and lose their ticket.</b></p><div class="chips join-tix">${TICKETS.map((t) => `<a class="chip ${t === ticket ? 'on' : ''}" href="#/join/${t}">${CONTEST_NAME[t]} · ${euro(t)}</a>`).join('')}</div></div><div class="stepper"><span class="${d.pair ? 'on' : ''}"><i>1</i>Champion</span><span class="${d.picks.length ? 'on' : ''}"><i>2</i>Challenges</span><span class="${d.picks.length === 3 ? 'on' : ''}"><i>3</i>Enter</span></div></div>
  <h2 class="step"><i>1</i>Champion and role</h2><section class="card">${pp.html}</section>
  <h2 id="step2" class="step"><i>2</i>Three challenges for ${pairLabel(d.pair)}</h2><div class="slots">${[0, 1, 2].map(slot).join('')}</div>
  <p class="small muted">Thresholds for ${/^[AEIOU]/.test(tierName(tier)) ? 'an' : 'a'} ${tierName(tier)} player. ${TERMS.levels} ${TERMS.window} Under each level: how often your entered games made it. ${rl('challenges')}</p>
  <div class="grid chgrid">${D.challenges.filter((c) => offers[c.id]).map((c) => {
    const chosen = d.picks.find((x) => x.id === c.id);
    return `<div class="ch ${chosen ? 'on' : ''}"><div class="row between"><h3>${c.name}</h3><span class="tag">${c.family}</span></div>
    <p class="small muted">${challengeText(d.pair, c.id, chosen ? chosen.level : LEVELS.find((l) => offers[c.id][LEVELS.indexOf(l)] != null), tier)}</p>
    <div class="levels">${LEVELS.map((l, i) => { const t = r[`${d.pair}#${c.id}#${l}`]; const off = offers[c.id][i] == null; return `<button class="lv ${chosen && chosen.level === l ? 'on' : ''}" data-ch="${c.id}" data-lv="${l}" ${off ? 'disabled title="Not offered for this champion and role at this level"' : ''}><b>${l} · ${POINTS[l]}</b>${off ? 'not offered' : `${lineText(d.pair, c.id, l, tier)}<span class="you">${t ? (t.n < 5 ? `you ${pct(t.hits / t.n)} · few data` : `you ${pct(t.hits / t.n)}`) : 'no games yet'}</span>`}</button>`; }).join('')}</div></div>`;
  }).join('')}</div>
  <div class="card lockbar gold"><div class="row between"><div><b><i class="stepn">3</i>${pairLabel(d.pair)}</b> · ${d.picks.length ? d.picks.map((p) => `${CH[p.id].name} ${LV[p.level]}`).join(' · ') : 'pick 3 challenges'} · up to ${pts} challenge points, plus ${RESULT_PTS.win} for a win or ${RESULT_PTS.loss} for a loss
  <div class="small muted">Ticket ${euro(ticket)} · <b>nothing is charged now</b>: the ticket is taken when your game enters a contest. First game with this champion and role after locking · no changes after locking · cancelling runs a check first. ${rl('signups')}</div>
  ${ticket > S.balance ? `<div class="small l">Your balance (${euro2(S.balance)}) does not cover this ticket.</div>` : ''}</div>
  <button class="btn" id="lock" ${d.picks.length === 3 && ticket <= S.balance ? '' : 'disabled'}>Enter the contest</button></div></div>`;
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
    joinDraft = null; save(); toast('Entered. Nothing is charged until your game enters the contest: now play a solo queue game, then check your games.');
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
    body = `${checkBar()}${act.length ? `<div class="list">${act.map(signupRow).join('')}</div>` : '<p class="muted">Nothing entered. <a href="#/contests">Join a prize contest</a>.</p>'}${ended.length ? `<h2>Ended sign-ups</h2><div class="list">${ended.map(signupRow).join('')}</div>` : ''}`;
  } else if (t === 'progress') {
    const l = mineC.filter((c) => c.state === 'open');
    body = l.length ? `<div class="list">${l.map((c) => { const me = ranked(c).find((e) => e.you); return `<a class="item link" href="#/contest/${c.id}"><div class="row nowrap"><div class="grow"><b>${cName(c.ticket)} #${num(c.id)}</b><div class="small muted">${c.entries.length}/${SEATS} games · ${me.total} pts</div></div><span class="big">${ord(me._place)}</span></div></a>`; }).join('')}</div>` : '<p class="muted">No open contest with your games.</p>';
  } else {
    const l = mineC.filter((c) => c.state === 'done').sort((a, b) => b.closedAt - a.closedAt);
    body = l.length ? `<div class="list">${l.map((c) => { const me = c.entries.find((e) => e.you); return `<a class="item link" href="#/contest/${c.id}"><div class="row nowrap"><div class="grow"><b>${cName(c.ticket)} #${num(c.id)}</b><div class="small muted">${day(c.closedAt)} · ${me.total} pts</div></div><span class="big">${ord(me.place)}</span><span class="${me.prize ? 'w' : 'muted'}">${me.prize ? `won ${euro2(me.prize)}` : 'no prize'}</span></div></a>`; }).join('')}</div>` : '<p class="muted">No finished contest yet.</p>';
  }
  app.innerHTML = `<p class="back"><a href="#/contests">← Contests</a></p><div class="route-title"><p class="eyebrow">Contest area</p><h1>My contests</h1><p>The games you entered, the contests in progress and the finished ones.</p></div>${tabs([['#/mine', 'Waiting', 'waiting'], ['#/mine/progress', 'In progress', 'progress'], ['#/mine/finished', 'Finished', 'finished']], t)}${body}`;
}
const openRows = new Set();
function viewContest(id) {
  if (needAccount()) return;
  const c = S.contests[id];
  if (!c) { app.innerHTML = '<p>Contest not found. <a href="#/contests">Lobby</a></p>'; return; }
  const rows = c.state === 'done' ? [...c.entries].sort((a, b) => a.place - b.place || a.at - b.at).map((e) => ({ ...e, _place: e.place, _prize: e.prize, _tie: c.entries.filter((x) => x.place === e.place).length > 1 })) : ranked(c);
  const zoneOf = (p) => (PRIZE_X[p - 1] > 0 ? 'top' : 'none');
  const ZONE = { top: 'Prizes', back: 'Prizes', part: 'Prizes', none: 'No prize' };
  const me = rows.find((e) => e.you);
  const above = me && rows.filter((e) => e._place < me._place).pop();
  let lastZone = null;
  const html = rows.map((e, i) => {
    const z = zoneOf(e._place);
    const sep = z !== lastZone ? `<tr class="sep z-${z}"><td colspan="5"><span>${ZONE[z]}</span></td></tr>` : '';
    lastZone = z;
    const k = `${id}:${i}`;
    const res = `<span class="res ${e.win ? 'ok' : 'no'}">${e.win ? 'Win' : 'Loss'} ${resultPts(e.win)}</span>` + e.results.map((r) => `<span class="res ${r.full ? 'ok' : r.frac > 0 ? 'part' : 'no'}" title="${CH[r.id].name} ${r.level}: ${fmt(r.id, r.value)} for ${fmt(r.id, r.hi)}">${r.full ? '✓' : r.frac > 0 ? '◐' : '✗'} ${CH[r.id].name} ${LV[r.level]}</span>`).join('');
    return `${sep}<tr class="${e.you ? 'you' : ''} z-${z}" data-row="${k}"><td><span class="place">${e._tie ? '=' : ''}${e._place}</span></td>
    <td><div class="row nowrap">${icon(splitPair(e.pair).champ)}<div><b>${esc(e.name)}</b>${e.you ? ' <span class="tag gold">you</span>' : ''}<div class="small muted">${tierName(e.tier)} · ${pairLabel(e.pair)}</div></div></div></td>
    <td class="chs">${res}</td><td class="pts"><b class="kpi">${e.total}</b></td>${c.state === 'done' ? `<td class="prize">${e._prize ? euro2(e._prize) : '<span class="muted">—</span>'}</td>` : ''}</tr>
    ${openRows.has(k) ? `<tr class="detail"><td></td><td colspan="4">${e.results.map((r) => `<div class="small">${CH[r.id].name} <span class="tag ${r.level}">${r.level}</span> ${fmt(r.id, r.value)} for a line of ${fmt(r.id, r.hi)} → <b>${r.points}</b> pts</div>`).join('')}</td></tr>` : ''}`;
  }).join('');
  app.innerHTML = `<p class="back"><a href="#/contests">← Contests</a></p><div class="hello contest-head ${c.state === 'done' ? 'is-finished' : ''}"><div><p class="eyebrow">Prize contest · 20 players · rules v1 ${rl('changes', '')}</p><h1>${cName(c.ticket)} #${num(c.id)}</h1>
  <p class="sub">${c.state === 'open' ? `<span class="tag wait">Open ${c.entries.length}/${SEATS}</span> Provisional: it changes as games come in.` : `<span class="tag ok">Finished</span> ${day(c.closedAt)}.${me ? (me.prize ? ` <b>${ord(me.place)} place: you won ${euro2(me.prize)}.</b> It is in your wallet.` : '') + (above ? ` ${Math.round((above.total - me.total) * 10) / 10} points to the place above.` : '') : ''}`} ${TERMS.riotId} ${TERMS.ownTier} Tap a row for the values.</p></div>
  <div class="counter"><b>${c.entries.length}</b><span>of ${SEATS}</span></div></div>
  <table class="lb"><tr class="head"><th>#</th><th>Player</th><th>Challenges</th><th style="text-align:right">Pts</th>${c.state === 'done' ? '<th style="text-align:right">Won</th>' : ''}</tr>${html}</table>
  <p class="small muted" style="margin-top:8px">✓ made it · ◐ part of the way (window scoring) · ✗ missed. “=” is a tie: tied players share the prizes of the places they hold. ${rl('contests')}</p>`;
  app.querySelectorAll('[data-row]').forEach((tr) => (tr.onclick = () => { const k = tr.dataset.row; openRows.has(k) ? openRows.delete(k) : openRows.add(k); const y = scrollY; viewContest(id); scrollTo(0, y); }));
}
function viewWallet() {
  if (needAccount()) return;
  const KIND = { deposit: 'Deposit', ticket: 'Ticket', prize: 'Prize', refund: 'Refund', withdrawal: 'Withdrawal' };
  app.innerHTML = `<p class="back"><a href="#/contests">← Contests</a></p><div class="route-title"><p class="eyebrow">Contest area</p><h1>Wallet</h1><p>Demo: play money. In the real product deposits and withdrawals go through a payment provider; bank details stay with them. ${rl('contests')}</p></div>
  <div class="walletbar"><div><p class="eyebrow">Balance</p><div class="big">${euro2(S.balance)}</div></div><div class="row"><button class="btn ghost" data-deposit>Deposit</button><button class="btn ghost" data-withdraw>Withdraw</button></div></div>
  <h2>Movements</h2><div class="tablewrap"><table class="num"><tr><th>Date</th><th>Movement</th><th>Contest</th><th style="text-align:right">Amount</th></tr>
  ${S.ledger.slice().sort((a, b) => b.at - a.at).map((l) => `<tr><td>${day(l.at)} ${clock(l.at)}</td><td>${KIND[l.kind]}</td><td>${l.contestId ? `<a href="#/contest/${l.contestId}">#${num(l.contestId)}</a>` : '<span class="muted">—</span>'}</td><td style="text-align:right" class="${l.amount > 0 ? 'w' : ''}">${l.amount > 0 ? '+' : '−'}${euro2(Math.abs(l.amount))}</td></tr>`).join('')}</table></div>`;
}
function viewVerify() {
  if (needAccount()) return;
  const back = S.afterVerify || '#/contests';
  app.innerHTML = `<div class="narrow"><div class="route-title"><p class="eyebrow">Contest area</p><h1>Verify your identity</h1><p>Prizes are real money: we need to know who you are. It is also needed to use points. No other player ever sees this data: in contests they see only your Riot ID. ${rl('accounts')}</p></div>
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
  app.innerHTML = `<div class="narrow"><div class="route-title acct-title">${summoner(P(), 'lg')}<div><p class="eyebrow">Your account</p><h1>Account</h1><p>${esc(P().name)} · ${tierName(P().tier)} · EUW</p></div></div>
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
  app.innerHTML = `<div class="narrow"><div class="route-title"><p class="eyebrow">Help</p><h1>Support</h1></div><div class="card"><p>Questions about a game, a contest or your account: write to <a href="mailto:david@skybreak.gg">david@skybreak.gg</a>. Include your Riot ID and the contest number.</p><p class="small muted">The rules answer most questions: <a href="#/rules">Rules</a>.</p></div></div>`;
}
/** How the numbers are made: the same words on the entry page and in the rules. */
function dataList() {
  return `<ul><li><b>Where the numbers come from:</b> public ranked solo games on EUW, from Iron to Master, read through Riot's official API after they end: ${D.facts.games.toLocaleString('en-GB')} games, 48,659 of them with the minute-by-minute timeline some challenges need. Nothing is read during a game.</li>
  <li><b>Lines per champion, role and rank tier:</b> each champion and role has its own lines, and each rank tier moves them by a correction measured role by role. A line sits where the average player of that tier reaches it in about 60% of games (easy), 35% (medium) or 15% (hard).</li>
  <li><b>Tested before use:</b> lines are fixed on older games and tested on newer ones. A challenge is offered only if it happens as often as declared, whether the game is won or lost, and better players make it happen more often.</li>
  <li><b>Your games never set your lines:</b> they are computed on everyone's games, never on yours.</li></ul>`;
}
const dataProof = () => `On newer games the challenges happened 60.1%, 35.1% and 15.0% of the time. A player's results on odd and even games correlate ${D.facts.follow.toFixed(2)}; winning alone, ${D.facts.wins.toFixed(2)}. Picking the luckiest champion gives at most ×${D.facts.edgeChampion.toFixed(2)}.`;
/** The rules, version 1: the English text of the rulebook (the Regolamento tab of "Skybreak: regole e prove"),
 *  article by article. Change the rulebook first, then this text; old wordings go in tests/old-phrases.json. */
const RULES = [
  ['what', 'What Skybreak is', `<p>1.1 Skybreak is a tool to improve your performance in League of Legends. It judges your ranked solo queue games (SoloQ): each game is compared with the average player of your rank tier, on the same champion and in the same role.</p>
  <p>1.2 The challenges and their thresholds are the same everywhere in the app.</p>
  <p>1.3 Skybreak has two areas, with the same judgement:</p>
  <ul><li><b>The personal area</b>, free: Intelligence and Training. It is analysis only, and there is nothing to win.</li><li><b>The contest area</b>: training contests, free, and the prize contests ${TICKETS.map((t) => CONTEST_NAME[t]).join(', ').replace(/, ([^,]*)$/, ' and $1')}, with a ticket. Every contest has ${SEATS} players, and each plays their own game whenever they want: nobody plays together with the others.</li></ul>
  <p>1.4 During a game Skybreak shows nothing on your screen: no overlay, no notifications. It reads games only after they have ended.</p>`],
  ['accounts', 'Accounts', `<p>2.1 There are two kinds of account.</p><div class="tablewrap"><table><tr><th></th><th>Base account</th><th>Verified account</th></tr><tr><td>What you can do</td><td>The whole personal area and training contests; view the lobby and the leaderboards of prize contests</td><td>In addition: prize contests, the wallet and using progress points</td></tr><tr><td>What it requires</td><td>Email, password, country, acceptance of the rules, a Riot account linked with Riot Sign On</td><td>In addition: first and last name, date of birth, address, an identity document</td></tr></table></div>
  <p>2.2 A person can have only one Skybreak account, linked to only one Riot account.</p><p>2.3 <b>The linked Riot account can never be changed.</b></p><p>2.4 Skybreak never asks for your Riot password.</p><p>2.5 In contests, other players see only your Riot ID, never your personal details.</p><p>2.6 You can download your data and ask for your account to be deleted. First you must withdraw your balance and wait for the contests you are in to end.</p>`],
  ['personal', 'The personal area', `<p>3.1 <b>Intelligence</b> shows all your ranked SoloQ games, your main champions compared with the players of your rank tier, and the numbers of every champion by role and rank tier: builds, matchups, tier lists and patch history.</p>
  <p>3.2 Intelligence gives players no rating and does not advise which challenges to choose in contests.</p>
  <p>3.3 <b>Training</b> analyses every ranked SoloQ game you play. It compares it with your usual game and with the average player of your rank tier, on the same champion and role, on the same challenges as the contests.</p>
  <p>3.4 Training is analysis only, visible only to you: there is nothing to enter and nothing to win.</p><p>3.5 The personal area is always free.</p>`],
  ['challenges', 'Challenges and scoring', `<p>4.1 A <b>challenge</b> is a measurable goal in a game: for example farm at 10 minutes, or deaths. Every champion in every role has its own challenges.</p>
  <p>4.2 A challenge is <b>fair</b> if it succeeds as often as declared for those who play that champion, in that role and in that rank tier, both in games won and in games lost. It is <b>real</b> if players with more mastery of that champion make it succeed more often. A challenge is offered for a champion and role only if it is fair and real.</p>
  <p>4.3 Every challenge has three levels:</p><div class="tablewrap"><table><tr><th>Level</th><th>How often the average player of your rank tier makes it</th><th>Points</th></tr><tr><td>Easy</td><td>about 6 games out of 10</td><td>${POINTS.easy}</td></tr><tr><td>Medium</td><td>about 1 game in 3</td><td>${POINTS.medium}</td></tr><tr><td>Hard</td><td>about 1 game in 7</td><td>${POINTS.hard}</td></tr></table></div>
  <p>4.4 The <b>threshold</b> is the value to reach for each level. It is the same for all players of the same champion, role and rank tier. It is computed on everyone's public ranked games, never on yours. Each threshold has two values, one for games won and one for games lost, so that the challenge succeeds as often as declared in both.</p>
  <p>4.5 <b>Window scoring.</b> If you reach the threshold of the chosen level, you get all its points. At the threshold of the level below you get 0 points, and between the two thresholds the points grow in proportion up to the maximum. Below the threshold of the level below you get 0. You never get more points than the chosen level. For the easy level, the threshold below is a lower threshold computed the same way.</p>
  <p>4.6 <b>The score of a game in a prize contest</b> is its result plus the 3 chosen challenges: ${RESULT_PTS.win} points for a win, ${RESULT_PTS.loss} for a loss, plus the points of the challenges, at most ${POINTS.hard * 3}. The maximum is therefore ${RESULT_PTS.win + POINTS.hard * 3} points.</p>
  <div class="tablewrap"><table><tr><th>Challenge</th><th>What it measures</th></tr>${D.challenges.map((c) => `<tr><td><b>${c.name}</b><br><span class="small muted">${c.family}</span></td><td class="small">${c.text.replace(/\{x\}|\{xl\}/g, '<i>threshold</i>').replace(/\{y\d0\}/g, '…')}</td></tr>`).join('')}</table></div>`],
  ['method', 'How the numbers are made', `<p>5.1 The numbers come from public ranked SoloQ games on EUW, from Iron to Master, read through Riot's official API after they have ended. During a game Skybreak reads nothing.</p>
  <p>5.2 The challenge thresholds are computed on ${D.facts.games.toLocaleString('en-GB')} games, 48,659 of them with the minute-by-minute timeline that some challenges need. Today the number of games is limited by the developer key of Riot's API: with many more games the thresholds would be even more precise. The champion numbers in Intelligence use a larger set, which the site keeps up to date.</p>
  <p>5.3 Every champion in every role has its own thresholds, and each rank tier moves them with a correction measured role by role.</p>
  <p>5.4 Thresholds are set on the older games and tested on the newer ones. On the newer games the challenges succeeded 60.1%, 35.1% and 15.0% of the time. To check that a challenge depends on skill, the games of every player with at least 30 games in the data are split into odd and even: the results in the two halves correlate ${D.facts.follow.toFixed(2)}, while winning alone correlates ${D.facts.wins.toFixed(2)}. Picking the luckiest champion gives at most an advantage of ${D.facts.edgeChampion.toFixed(2)} times.</p>`],
  ['signups', 'Entering, playing, checks and cancelling', `<p>This article applies to both training contests and prize contests.</p>
  <p>6.1 <b>Entering.</b> You enter your next game before playing it. In prize contests you also choose the champion, the role and the 3 challenges with their level. After entering, nothing can be changed.</p>
  <p>6.2 <b>The contest game</b> is the first ranked SoloQ game started after entering. In prize contests it must be played with exactly the chosen champion and role.</p>
  <p>6.3 <b>One game, two contests.</b> A game counts for only one prize contest. A prize contest always includes a training contest, so the same game also enters a training contest: you can win or lose twice. You are never twice in the same contest.</p>
  <p>6.4 <b>Several identical entries.</b> If you have several entries of the same kind with the same champion and role, games go in order: the first game to the first entry.</p>
  <p>6.5 <b>Checks.</b> Skybreak checks everyone's games once a day. You can also check whenever you want with the Check my games button.</p>
  <p>6.6 <b>Entries not played.</b> An entry not played by the next day's check is cancelled, in training contests and in prize contests.</p>
  <p>6.7 <b>Cancelling.</b> You can cancel an entry until its game has entered a contest. Cancelling runs a check at once:</p>
  <ul><li>if it finds a valid game started after the entry, the game counts and the cancellation does not apply;</li><li>if you are in a game at that moment, the cancellation is refused: try again after the game;</li><li>otherwise the entry is cancelled at once.</li></ul>
  <p>This applies to training contests too, so a bad game cannot be hidden.</p>
  <p>6.8 Only entered games count in contests. Training, instead, analyses all your ranked games, for you alone.</p>
  <p>6.9 <b>Withdrawals.</b> You cannot withdraw your balance while you have prize contest entries waiting for their game.</p>`],
  ['games', 'Which games count', `<div class="tablewrap"><table><tr><th>Case</th><th>Rule</th></tr><tr><td>Remakes and games under 10 minutes</td><td>Do not count: the entry keeps waiting and no ticket is taken.</td></tr><tr><td>Dodges</td><td>Not a game: nothing happens.</td></tr><tr><td>Surrenders</td><td>Count normally: a win for the side that wins, a loss for the side that surrenders.</td></tr><tr><td>Games played in duo</td><td>Do not count. It is a rule of honour: by entering a game you declare that you play it alone.</td></tr><tr><td>Normal, flex, ARAM and other queues</td><td>Do not count: only SoloQ counts.</td></tr></table></div>`],
  ['training', 'Training contests and progress points', `<p>8.1 The training contest is free and open to all rank tiers together, with a base account. It has ${SEATS} players, and each plays their own game.</p>
  <p>8.2 Nothing is chosen: your next SoloQ game counts, with any champion.</p>
  <p>8.3 Each game is compared with the usual game of whoever played it, with that champion and role. Whoever improves most ranks highest.</p>
  <p>8.4 The improvement number counts only inside that contest.</p>
  <p>8.5 Training contests award <b>progress points</b>. They are earned only by improving: they are never bought and never become money.</p>
  <p>8.6 Progress points open coaching, merch and try-outs with a team. Using them requires a verified account.</p>`],
  ['contests', 'Prize contests', `<p>9.1 <b>The three contests.</b> ${TICKETS.map((t) => `${CONTEST_NAME[t]}, with a ${euro(t)} ticket`).join('; ')}. The ticket is the price to take part: it is not a sure win. They require a verified account and the 3 challenges chosen when entering.</p>
  <p>9.2 <b>Thresholds of your own rank tier.</b> Each player is judged on the thresholds of their own rank tier: an Iron and a Diamond compete in the same contest on equal terms.</p>
  <p>9.3 <b>The wallet.</b> The balance is in euro. The value of the ticket is taken from the balance only when the game enters the contest; until then the balance stays yours. If the balance does not cover an entry, the entry is cancelled.</p>
  <p>9.4 <b>${SEATS} seats.</b> A contest stays open until ${SEATS} games have entered; then it closes with the final leaderboard and the prizes. While it is open you see the seat counter and the provisional leaderboard, with the other players' Riot IDs and their results challenge by challenge.</p>
  <p>9.5 <b>Maximum time.</b> If a contest does not reach ${SEATS} games within 2 days, it is cancelled and every ticket goes back to the balance.</p>
  <p>9.6 <b>Prizes.</b> Prizes go to the first ${PRIZE_X.filter((x) => x > 0).length} places. Only the first ${PRIZE_X.filter((x) => x > 1).length} receive more than the value of the ticket. From ${ord(PRIZE_X.filter((x) => x > 0).length + 1)} to ${ord(SEATS)} place nothing is won and the ticket is lost.</p>
  ${prizeTable()}
  <p>9.7 <b>Ties.</b> Players on the same points add up the prizes of the places they hold and split them equally. A cent left over by the split goes to whoever entered the contest first.</p>
  <p>9.8 <b>Training contest included.</b> The game of a prize contest also enters a training contest and earns progress points (6.3 and 8).</p>`],
  ['fairplay', 'Fair play', '<p>10.1 On contest fair play the tolerance is zero: abuse is punished directly.</p><p>10.2 Smurfs, and accounts shared or played by another person, are forbidden.</p><p>10.3 A ban hits the person, not only the game account.</p>'],
  ['data', 'Your data', '<p>11.1 After you sign in with Riot, Skybreak reads from Riot, through the official API: your Riot ID, region, rank tier and your ranked SoloQ games. During a game it reads nothing.</p><p>11.2 Skybreak keeps: your entries, the games found and how they were judged, contests, your balance and its movements. For verified accounts it also keeps the result of the identity check.</p><p>11.3 Skybreak calculates no player ratings, sells no data and shows nobody the personal details of others.</p><p>11.4 You can download your data and ask for its deletion from the Account page (see 2.6).</p>'],
  ['changes', 'When the rules change', '<p>12.1 The rules are the same for everyone and public before you sign up.</p><p>12.2 They change only with notice. A contest already open ends under the rules it started with.</p><p>12.3 The rules carry a version number: this is version 1.</p>'],
  ['open', 'Still to be decided', '<p>These points are not rules yet: once decided, they go into the articles.</p><ul><li>The time of the end-of-day check and how many manual checks per day (6.5).</li><li>The final improvement formula in training contests (8.4).</li><li>How many progress points each improvement is worth and what each reward costs (8.6).</li><li><b>Other prize curves.</b> Besides Rising, Pro and Elite there will be variants with prizes shifted more towards the top places. Each variant will have its own prize table, published before entering.</li></ul>'],
];
function viewRules(sec) {
  app.innerHTML = `<div class="rules"><div class="route-title"><p class="eyebrow">The same for everyone</p><h1>Rules</h1><p>Public before you sign up, changed only with notice.</p></div>
  <details class="card rules-short"><summary><b>The rules in short</b> <span class="small muted">· one sentence per system, the same on every page</span></summary><ul>${Object.values(TERMS).map((t) => `<li>${t}</li>`).join('')}</ul></details>
  <div class="rules-body"><nav class="toc" aria-label="Sections">${RULES.map(([id, n], i) => `<a href="#/rules/${id}" class="${id === sec ? 'on' : ''}">${i < RULES.length - 1 ? `<span>${i + 1}</span>` : '<span>·</span>'}${n}</a>`).join('')}</nav>
  <div class="rules-text">${RULES.map(([id, n, body], i) => `<section id="r-${id}" class="${id === sec ? 'hl' : ''}"><h2>${i < RULES.length - 1 ? `${i + 1}. ` : ''}${n}</h2>${body}</section>`).join('')}</div></div></div>`;
  if (sec && document.getElementById(`r-${sec}`)) requestAnimationFrame(() => document.getElementById(`r-${sec}`).scrollIntoView({ block: 'start' }));
}

// ---------- router ----------
/** The review path for Riot: optional, six stops on the real screens. A bar that never covers the page;
 *  Back, Next and close at every stop, and the reviewer can wander off and come back to the stop. */
const TOUR = [
  { to: () => '#/home', name: 'Home', title: 'A player\'s own games, read after they end',
    text: `${TERMS.during} ${TERMS.data}` },
  { to: () => { const g = S.games.filter((x) => x.analysed).slice(-1)[0]; return g ? `#/train/game/${g.id}` : '#/train'; }, name: 'Training', title: 'One game against the average of the same rank tier',
    text: `${TERMS.training} Rank tier only: no MMR and no player rating.` },
  { to: () => '#/intel', name: 'Intelligence', title: 'The numbers of every champion',
    text: 'Builds, matchups and tier lists by role and rank tier, from public ranked games. To study the game; nothing here is advice for a contest.' },
  { to: () => '#/contests/training', name: 'Training contest', title: 'Free: 20 players, each in their own game',
    text: `${TERMS.trainingContest} ${TERMS.points}` },
  { to: () => '#/contests/prize', name: 'Prize contests', title: 'A ticket to compete, prizes apart',
    text: `${TERMS.prizeContest} ${TERMS.ticket} ${TERMS.ownTier} ${TERMS.prizes} Verified accounts only; play money in this demo.` },
  { to: () => { const c = Object.values(S.contests).filter((x) => x.kind !== 'imp' && x.state === 'done' && x.entries.some((e) => e.you)).sort((a, b) => b.closedAt - a.closedAt)[0]; return c ? `#/contest/${c.id}` : '#/mine/finished'; }, name: 'A finished contest', title: 'The final ranking',
    text: `${TERMS.score} ${TERMS.riotId} Players, time and money are simulated in the demo; the games and thresholds are real.` },
];
function tourBar() {
  let el = $('#tour');
  if (S.tour == null || S.profile == null) { if (el) el.remove(); document.body.removeAttribute('data-tour'); return; }
  const i = Math.max(0, Math.min(TOUR.length - 1, S.tour)), st = TOUR[i], last = i === TOUR.length - 1;
  const path = (h) => h.split('?')[0];
  const here = path(location.hash) === path(st.to());
  if (!el) { el = document.createElement('aside'); el.id = 'tour'; el.className = 'tour'; el.setAttribute('aria-label', 'Review path'); document.body.appendChild(el); }
  document.body.dataset.tour = S.tourFold ? 'fold' : 'on';
  el.classList.toggle('fold', !!S.tourFold);
  el.innerHTML = `<div class="tour-top"><span class="eyebrow">Review path · ${i + 1} of ${TOUR.length}</span><span class="tour-dots" aria-hidden="true">${TOUR.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'done' : ''}"></i>`).join('')}</span>
    <button type="button" class="tour-ic" data-tour="fold" aria-label="${S.tourFold ? 'Show the stop' : 'Make it small'}" aria-expanded="${!S.tourFold}">${S.tourFold ? '▴' : '▾'}</button><button type="button" class="tour-ic" data-tour="close" aria-label="Close the review path">×</button></div>
    <b class="tour-title">${st.title}</b><p class="tour-text">${st.text}</p>
    <div class="tour-act">${i > 0 ? '<button type="button" class="btn ghost small" data-tour="prev">← Back</button>' : ''}${here ? '' : `<button type="button" class="btn ghost small" data-tour="here">Back to stop ${i + 1}</button>`}
    <button type="button" class="btn small" data-tour="next">${last ? 'Read the rules →' : `Next: ${TOUR[i + 1].name} →`}</button></div>`;
}
function tourGo(i) {
  if (i >= TOUR.length) { S.tour = null; save(); location.hash = '#/rules'; toast('Review path finished. Overview for Riot, at the top of every page, opens it again.'); return; }
  if (S.profile == null) signIn(DEMO_PROFILE); // signing in starts the demo over, so the stop is set after it
  S.tour = Math.max(0, i); S.tourFold = false; save();
  const to = TOUR[S.tour].to();
  if (location.hash === to) { render(); scrollTo(0, 0); } else location.hash = to;
}
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
  else if (route === 'contests') viewLobby(arg);
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
  tourBar();
}
document.addEventListener('click', (e) => {
  const tb = e.target.closest('[data-tour]');
  if (tb) {
    const a = tb.dataset.tour, i = S.tour ?? 0;
    if (a === 'start') tourGo(0);
    else if (a === 'next') tourGo(i + 1);
    else if (a === 'prev') tourGo(i - 1);
    else if (a === 'here') tourGo(i);
    else if (a === 'fold') { S.tourFold = !S.tourFold; save(); tourBar(); }
    else if (a === 'close') { S.tour = null; save(); tourBar(); toast('Review path closed. Overview for Riot, at the top of every page, opens it again.'); }
    return;
  }
  const c = e.target.closest('[data-check]');
  if (c && S.profile != null) {
    const n = runCheck({ endOfDay: c.dataset.check === 'day' });
    toast(n ? `Check done: ${n} new game${n > 1 ? 's' : ''} found: they are in your Training match history.` : 'Check done: no new games.');
    render(); return;
  }
  const sp = e.target.closest('[data-spend]');
  if (sp && !sp.disabled) { spendReward(sp.dataset.spend); const y = scrollY; render(); scrollTo(0, y); return; }
  const lk = e.target.closest('[data-lock]');
  if (lk && S.profile != null) { lockPair(lk.dataset.lock); return; }
  const u = e.target.closest('[data-unlock]');
  if (u) { const s = S.signups.find((x) => x.id === u.dataset.unlock); if (s && s.status === 'waiting') { unlock(s); render(); } return; }
  if (e.target.closest('[data-signout]')) { S.profile = null; save(); location.hash = '#/signin'; return; }
  if (e.target.closest('[data-deposit]')) { money('deposit', 1000, null); save(); toast('Demo: 10 € of play money added.'); render(); return; }
  if (e.target.closest('[data-withdraw]')) { toast(S.signups.some((x) => x.kind === 'contest' && active(x)) ? 'You cannot withdraw while you have prize contest entries waiting for their game.' : 'In the real product withdrawals go to your payment provider.'); return; }
  const me = $('details.me[open]');
  if (me && !e.target.closest('details.me')) me.open = false;
});
addEventListener('hashchange', () => { render(); scrollTo(0, 0); });
load();
render();
