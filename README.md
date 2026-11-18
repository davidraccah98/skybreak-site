# Skybreak: site and demo

Skybreak is a product for League of Legends solo queue players (EUW). Every game a player signs up is judged against the average player of the same tier, champion and role, on a catalog of 14 challenges with real thresholds. Two areas of equal weight, on the same challenges:

- **Personal area (free, base account):** Intelligence (you against your tier; everyone's thresholds), Training (sign up a champion and role; the game is judged on every challenge of the pair and enters a free improvement contest of 20), milestones.
- **Contest area (prizes, verified account):** lock a champion, a role and 3 challenges; the first game with that pair enters a contest of 20 players; 2, 5 or 10 € tickets, prizes by place (the top 4 up to twice the ticket, places 5 to 12 the ticket back). The wallet lives in the contest lobby.

The product plan this mockup is built on is `docs/APP.md` (in Italian): areas, every page with a wireframe, accounts, rules, look, reviewer guide. This is the mockup for the Riot developer application, live at http://skybreak.gg (landing) and http://skybreak.gg/app/ (demo) once published.

## How to open it

Plain HTML, CSS and JavaScript, no build step and no dependencies. Run `node serve.mjs` and open http://localhost:4180, or serve the folder with any static server, for example:

```
npx serve .
```

or open `index.html` directly in a browser. Champion icons load from Riot's Data Dragon CDN; fonts from Google Fonts. The demo keeps its state in `localStorage`; Account › Reset the demo starts over.

## Checks

`node tests/check.mjs` opens every page of the demo in a headless Chrome at 1440, 768 and 375 px and checks: no errors, nothing wider than the screen, the same page head on every page, the prize score (100 for a win, 50 for a loss, at most 90 from the challenges), the prizes (14 paid places, the last 6 at zero, every finished contest paying out exactly its prizes), no betting words, and no old wording of a rule (`tests/old-phrases.json`). It starts its own server on port 4199 and takes about two minutes. Exit code 1 lists what failed. Needs Google Chrome or Edge (or `CHROME=<path>`).

When a rule is rewritten, add its old sentence to `tests/old-phrases.json`, so the check finds any page still showing it.

## Files

| File | What it is |
|---|---|
| `docs/APP.md` | The product plan (Italian): what every page shows and why. |
| `index.html` | Sends skybreak.gg to the demo's entry page (`app/#/signin`). |
| `app/index.html` | The demo shell and all its CSS (design tokens, two area themes). |
| `app/app.js` | All the demo logic: hash router, views, scoring, checks, contests, the reviewer guide. |
| `app/data.js` | `window.SKY`: the real challenge catalog (14 challenges, thresholds for 285 champions and roles, levels, texts, facts). |
| `app/profiles.js` | `window.PROFILES`: first the founder's own account (Er Zebbor#EUW, Emerald, 81 real ranked games), the demo account; then 5 real EUW players (Gold, Platinum, Emerald, Diamond, Master) with their real ranked games and challenge values, under invented names. `window.ADJUST`: the per-tier correction of each threshold. |
| `app/history.js` | `window.HISTORY`: every ranked solo game Riot keeps for the founder's account (654 games since July 2025), with KDA, farm, gold, damage, vision, lane opponent and the value of each challenge. Read by Intelligence and by the improvement on Home. |
| `app/champions.js` | `window.CHAMPSTATS`: everyone's numbers per champion, role and tier (win rate, popularity, KDA, damage, gold, CS, vision, length, typical challenge values), from the lab's ranked games on EUW. Loaded only when Intelligence opens. |

## Routes of the demo

| Area | Route | Screen |
|---|---|---|
| Public | `#/signin` | Pick one of the 5 accounts (stands in for Riot Sign On). |
| | `#/signup` → `#/link` | Create account, then link the Riot account. |
| Personal | `#/home` | Welcome; three blocks: how you're playing, how you're improving, where to compete. |
| | `#/intel`, `#/intel/explore` | You against your tier per challenge (diverging bars, last 10), strengths, tips; contest hit rates. Explore: everyone's thresholds by champion, role, tier. |
| | `#/train` (+ `/games`, `/improvement`, `/milestones`) | Training sign-ups, every game found, improvement contests, milestones. |
| | `#/train/new` | Lock a champion and role. |
| | `#/train/game/{id}` | Report of a game: improvement (demo numbers), every challenge with value, tier typical, position 0-100, contest level reached. |
| | `#/train/contest/{id}` | Improvement contest leaderboard. |
| Contest | `#/contests` | Lobby: wallet, verification, the 2/5/10 € contests, in progress, waiting, fair play, how it works. |
| | `#/join/{cents}` | Pair (carousel), 3 empty slots, challenge catalog with thresholds and the player's own rates, sticky lock bar. |
| | `#/mine` (+ `/progress`, `/finished`) | My contests. |
| | `#/contest/{id}` | Leaderboard: Riot IDs only, prize zones, ties; tap a row for the values. |
| | `#/wallet`, `#/verify` | Balance and movements; identity form (can be skipped). |
| Common | `#/account`, `#/support`, `#/rules/{section}` | Account and data; support; rules with one address per section. |

The "Riot reviewer guide" button in the demo bar opens a side panel with 7 steps through the real screens.

## What is real and what is simulated

- **Real:** the thresholds (computed on 121,585 ranked EUW games), the tier correction, and the 5 accounts' games and challenge values. A check reveals the account's next real game.
- **Simulated:** the other players, the clock (each check moves it forward), the money (play money), Riot Sign On, identity verification, and the improvement numbers (the formula is not final).

## Rules the design must respect

These come from the product decisions and from Riot's developer policies; a change that breaks them is not usable.

- Nothing is shown during the game: no overlay, no pop-ups, no in-game information.
- No MMR, ELO or permanent player rating. Say "rank tier", never "elo". The improvement number counts only inside its contest.
- Skybreak shows data but never chooses for the player: no pre-filled challenges, no "we recommend these 3".
- Only signed-up games are analysed.
- In contests other players see only the Riot ID, never personal data. The linked Riot account can never be changed.
- Contest prizes: 80% of the tickets go back to players (Riot requires at least 70%); 20 players per contest; the free tier is the improvement contest.
- Nothing that looks like gambling or betting: only the player's own performance counts, measured against their own tier.
- No Riot logos; the Riot disclaimer stays on every page.
- The ticket is taken only when the game enters a contest; the balance can never fall short.
- Fair play: one zero-tolerance line, no detection details in public texts.

## What feedback is useful

Layout and visual hierarchy, clarity of the texts for a player who has never seen the product, the personal area as a self-improvement tool (is the Intelligence chart readable? is the game report clear?), the contest flow (join, check, unlock, leaderboard), the reviewer guide, mobile, and accessibility.

Agents: read `AGENTS.md` first.
