# Working on Skybreak

Instructions for any AI agent (Codex, Claude, others) working in this folder. Read them before changing anything.

## What this is

The public site of Skybreak (skybreak.gg), served by GitHub Pages from the repository `davidraccah98/skybreak-site`:

- `index.html`: the landing page.
- `app/`: the demo (mockup) used for the Riot developer application. Plain HTML, CSS and JavaScript, no build step, no dependencies.
  - `app/index.html`: the shell and **all the CSS** (design tokens at the top, two area themes).
  - `app/app.js`: all the logic and the HTML of every view (template strings).
  - `app/data.js`, `app/profiles.js`: real data. **Never edit them.**
- `docs/APP.md`: the product plan (in Italian): areas, every page with a wireframe, accounts, rules, look. The design must follow it.
- `README.md`: what is real and simulated, the routes, and the rules the design must respect.

Preview: `node serve.mjs`, then http://localhost:4180 and http://localhost:4180/app/. The demo keeps state in `localStorage`; Account › Reset the demo starts over.

## Rules that are never broken

- Nothing is shown during the game: no overlay, no pop-ups.
- No MMR, ELO or permanent player rating. Texts say "rank tier", never "elo".
- Skybreak never chooses for the player: no pre-filled challenges, no "we recommend these 3".
- In contests other players see only the Riot ID.
- Nothing that looks like gambling or betting: no casino, slot, odds or betting imagery or words ("bet", "odds", "jackpot", "stake"). The product is about the player's own performance against their own tier.
- **No Riot Games logos, no League of Legends logos, no splash art or official artwork used as brand graphics, nothing that looks like an official Riot or LoL Esports event.** Champion icons from Data Dragon are allowed only where a champion is named (pickers, lists, leaderboards). The Riot disclaimer stays in the footer of every page.
- Texts and numbers that come from data (thresholds, prizes, rules) are not changed by design work.

## How to work

- Change the look, not the logic: CSS, markup inside the view templates, images. Do not change scoring, thresholds, the check, contests, prizes or the router.
- Two visual languages (docs/APP.md, section 10):
  - **atmosphere** (sky, light, depth) for the landing, the Home hero and moments like a finished contest;
  - **technical** (tight grid, aligned numbers) for Intelligence, reports, tables, leaderboards.
  - Personal area: night blue with a sky-blue accent. Contest area: darker, gold accent. Colours change between areas, the structure does not.
- Keep the design tokens in `:root` of `app/index.html` as the single source of colours, fonts, spacing and radii.
- Generated images go in `assets/` (landing) or `app/assets/` (demo), as `.webp` or `.svg`, compressed (aim under 300 KB each), with an empty `alt=""` when decorative. Name files by what they show (`hero-sky.webp`).
- Mobile matters: check every page at 375 px wide; no horizontal scrolling; the bottom bar in the app must stay usable.
- Accessibility: enough contrast, states never shown by colour alone, everything usable with the keyboard.
- Work one area at a time, and at the end list the files changed and what changed in each, with screenshots if you can.
- Do not commit or push unless the owner asks. Do not add analytics, trackers, external scripts or new CDNs (Google Fonts and Data Dragon are already used).
- Never ask for or use credentials or API keys: this folder needs none.
