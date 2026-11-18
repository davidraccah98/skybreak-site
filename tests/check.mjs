// Automatic checks of the demo: node tests/check.mjs
// Opens every page in a headless Chrome, at three widths, and checks what docs/APP.md and the rules promise:
// no errors, nothing wider than the screen, the same page head everywhere, the prize score (100 a win, 50 a loss,
// plus at most 90 from the challenges), the prizes (14 paid places, the last 6 at zero), no betting words, and no
// old wording of a rule left on a page (tests/old-phrases.json). Exit code 1 if anything fails.
// Needs Google Chrome (or Edge); set CHROME to its path if it is not found. Needs no internet but Data Dragon images.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4199, DBG = 9334, BASE = `http://localhost:${PORT}/app/`;
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => p && existsSync(p));
if (!CHROME) { console.error('Chrome not found: set CHROME to its path.'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; // [ok, area, what]
const ok = (pass, area, what) => results.push([!!pass, area, what]);

// ---- the site on its own port, and a headless Chrome with a clean profile
const server = spawn(process.execPath, [join(root, 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
const prof = mkdtempSync(join(tmpdir(), 'skybreak-check-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${prof}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const stop = () => { try { chrome.kill(); } catch {} try { server.kill(); } catch {} setTimeout(() => { try { rmSync(prof, { recursive: true, force: true }); } catch {} }, 500); };

let tabs;
for (let i = 0; i < 60 && !tabs; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json(); } catch { await sleep(250); } }
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map(); const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
const size = (w, h, mobile) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
const go = async (hash, ms = 900) => { await ev(`location.hash = ${JSON.stringify(hash)}; scrollTo(0, 0); 1`); await sleep(ms); };

try {
  await send('Runtime.enable');
  await size(1440, 900, false);
  await send('Page.navigate', { url: `${BASE}#/signin` });
  await sleep(2500);

  // ---- the public entry page, then in as Er Zebbor
  const publicText = await ev('document.body.innerText');
  ok(/Follow the review path/i.test(publicText) && /Explore on your own/i.test(publicText), 'entry', 'the entry page offers the review path and free exploring');
  await ev(`document.querySelector('[data-enter="#/home"]').click(); 1`);
  await sleep(2500);

  // the pages: every area, and the detail pages a contest and a game open
  const ids = await ev(`({ game: (S.games.filter((g) => g.analysed).slice(-1)[0] || {}).id,
    done: (Object.values(S.contests).filter((c) => c.kind !== 'imp' && c.state === 'done').sort((a, b) => b.closedAt - a.closedAt)[0] || {}).id })`);
  const HEADS = ['#/home', '#/intel', '#/intel/patches', '#/train', '#/contests', '#/contests/training', '#/mine', '#/wallet', '#/rules', '#/account', '#/support'];
  const DETAIL = [`#/train/game/${ids.game}`, `#/contest/${ids.done}`, '#/verify', '#/join/200'];
  ok(ids.game && ids.done, 'pages', 'the demo has an analysed game and a finished prize contest to open');

  const pageText = {};
  for (const [w, h, mobile] of [[1440, 900, false], [768, 1024, false], [375, 812, true]]) {
    await size(w, h, mobile);
    const heads = [];
    for (const hash of [...HEADS, ...DETAIL]) {
      if (hash === '#/join/200') await ev('S.verified = true; save(); 1');
      errors.length = 0;
      await go(hash);
      const m = await ev(`(() => {
        const main = document.querySelector('main'), top = main.getBoundingClientRect().top;
        const head = main.querySelector('.route-title, .player-sky');
        let next = head && head.nextElementSibling; while (next && next.getBoundingClientRect().height === 0) next = next.nextElementSibling;
        const wide = [...document.querySelectorAll('main *, header *, footer *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1 && !el.closest('.tablewrap, .toc, .ctrack, [class*="scroll"]')).slice(0, 2).map((el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''));
        return { route: location.hash, h1: !!main.querySelector('h1'), over: document.documentElement.scrollWidth - innerWidth, wide,
          head: head ? Math.round(main.querySelector('h1').getBoundingClientRect().top - top) : null, next: next ? Math.round(next.getBoundingClientRect().top - top) : null,
          text: document.body.innerText };
      })()`);
      if (hash === '#/join/200') await ev('S.verified = false; save(); 1');
      const name = hash.replace(/\/[A-Z]\d+$/, '/…');
      ok(m.route.startsWith(hash.split('/').slice(0, 2).join('/')), `${w}px ${name}`, `opens (landed on ${m.route})`);
      ok(m.h1, `${w}px ${name}`, 'has a page title');
      ok(errors.length === 0, `${w}px ${name}`, errors.length ? `no errors: ${errors.slice(0, 2).join(' · ')}` : 'no errors');
      ok(m.over <= 0 && !m.wide.length, `${w}px ${name}`, m.over > 0 || m.wide.length ? `nothing wider than the screen: ${m.over}px too wide (${m.wide.join(', ')})` : 'nothing wider than the screen');
      if (HEADS.includes(hash)) heads.push([name, m.head, m.next]);
      pageText[hash] = m.text;
    }
    const h1s = new Set(heads.map((x) => x[1])), nexts = new Set(heads.map((x) => x[2]));
    const spread = (s) => Math.max(...s) - Math.min(...s);
    ok(spread(h1s) <= 2, `${w}px heads`, `every page title at the same height (${[...h1s].join(', ')} px)`);
    ok(spread(nexts) <= 2, `${w}px heads`, `every page's content starts at the same height (${heads.filter((x) => x[2] !== heads[0][2]).map((x) => `${x[0]} ${x[2]}`).join(', ') || heads[0][2] + ' px'})`);
  }

  // ---- the prize score and the prizes, from the demo's own state
  const sc = await ev(`(() => {
    const prize = Object.values(S.contests).filter((c) => c.kind !== 'imp');
    const entries = prize.flatMap((c) => c.entries);
    const bad = entries.filter((e) => Math.abs(e.total - prizeTotal(e.win, e.results)) > 0.05).length;
    const over = entries.filter((e) => e.results.some((r) => r.points > POINTS[r.level] + 1e-9)).length;
    const pool = PRIZE_X.reduce((a, x) => a + x, 0);
    const paid = prize.filter((c) => c.state === 'done').map((c) => { const rows = ranked(c); return { id: c.id, d: Math.round(rows.reduce((a, e) => a + (e._prize || 0), 0)) - Math.round(c.ticket * pool), n: c.entries.length }; });
    return { win: prizeTotal(true, []), loss: prizeTotal(false, []), max: POINTS.hard * 3, entries: entries.length, bad, over,
      // ties: 20 players, everyone on the same points, in each contest: the prizes must still add up to the cent
      tieOff: TICKETS.filter((t) => { const fake = { ticket: t, entries: Array.from({ length: 20 }, (_, k) => ({ total: k < 3 ? 150 : k < 10 ? 120 : 90, at: k })) };
        return ranked(fake).reduce((a, e) => a + e._prize, 0) !== Math.round(t * pool); }).map((t) => CONTEST_NAME[t]),
      places: PRIZE_X.filter((x) => x > 0).length, zero: PRIZE_X.slice(-6).every((x) => x === 0), seats: PRIZE_X.length,
      pools: TICKETS.map((t) => Math.round(t * pool) / 100), off: paid.filter((p) => p.d !== 0).map((p) => '#' + p.id + ' ' + (p.d > 0 ? '+' : '') + (p.d / 100) + ' € with ' + p.n + ' players'), done: paid.length };
  })()`);
  ok(sc.win === 100 && sc.loss === 50, 'score', `a win is worth 100 and a loss 50 (${sc.win} and ${sc.loss})`);
  ok(sc.max === 90, 'score', `the 3 challenges give at most 90 (${sc.max})`);
  ok(sc.entries > 0 && sc.bad === 0, 'score', `every prize contest entry is result + challenges (${sc.bad} wrong of ${sc.entries})`);
  ok(sc.over === 0, 'score', `no challenge gives more than its level (${sc.over} over)`);
  ok(sc.seats === 20 && sc.places === 14 && sc.zero, 'prizes', `20 places, the first 14 paid, the last 6 at zero (${sc.places} paid)`);
  ok(JSON.stringify(sc.pools) === '[32,80,160]', 'prizes', `prizes in all: Rising 32 €, Pro 80 €, Elite 160 € (${sc.pools.join(', ')})`);
  ok(!sc.tieOff.length, 'prizes', `with ties the prizes still add up to the cent (${sc.tieOff.length ? 'off in ' + sc.tieOff.join(', ') : 'Rising, Pro, Elite'})`);
  ok(sc.done > 0 && !sc.off.length, 'prizes', `every finished contest pays out exactly its prizes (${sc.off.length ? sc.off.join(', ') : 'all ' + sc.done}`);

  // ---- words: no betting words, no old wording of a rule
  const all = Object.entries(pageText);
  const BANNED = [[/\bbet(s|ting)?\b/i, 'bet'], [/\bodds\b/i, 'odds'], [/\bjackpot\b/i, 'jackpot'], [/\bstakes?\b/i, 'stake'], [/\bpays\b/i, 'pays'], [/×\s?2\b/, '×2'], [/twice the ticket/i, 'twice the ticket'], [/\belo\b/i, 'elo']];
  for (const [re, word] of BANNED) {
    const where = all.filter(([, t]) => re.test(t)).map(([h, t]) => { const i = t.search(re); return `${h} ("…${t.slice(Math.max(0, i - 40), i + 30).replace(/\s+/g, ' ')}…")`; });
    ok(!where.length, 'words', where.length ? `no "${word}": found on ${where.join(', ')}` : `no "${word}"`);
  }
  const old = JSON.parse(readFileSync(join(root, 'tests', 'old-phrases.json'), 'utf8'));
  for (const o of old.phrases) {
    const where = all.filter(([, t]) => t.toLowerCase().includes(o.phrase.toLowerCase())).map(([h]) => h);
    ok(!where.length, 'old rules', where.length ? `rule ${o.rule}: "${o.phrase}" still on ${where.join(', ')}` : `rule ${o.rule}: "${o.phrase}" is gone`);
  }
} catch (e) {
  ok(false, 'run', `the check stopped: ${e.message}`);
} finally {
  ws.close(); stop();
}

// ---- report
const fails = results.filter((r) => !r[0]);
const byArea = new Map();
for (const [pass, area] of results) { const a = byArea.get(area) || [0, 0]; a[pass ? 0 : 1]++; byArea.set(area, a); }
console.log(`\nSkybreak demo checks: ${results.length - fails.length} passed, ${fails.length} failed\n`);
for (const [pass, area, what] of fails) console.log(`  FAIL  ${area.padEnd(24)} ${what}`);
if (!fails.length) console.log('  Everything passed.');
console.log('');
process.exit(fails.length ? 1 : 0);
