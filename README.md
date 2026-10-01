# Sharpline

Fantasy football lineups, waivers, trades and player comparisons for you and your brothers. Runs on Netlify as an installable web app (PWA). Sign-in is a username and PIN; each account keeps its own leagues.

Version 2 replaces the sportsbook-props design. Props had to be fetched a day or more ahead to fit a free credit budget, so they were stale by game time. Everything now comes from free sources that need no API key and stay current through the week.

## Where the numbers come from

| Source | What it supplies | How it stays current |
|---|---|---|
| ESPN scoreboard | DraftKings spread and total (open and current), weather, game status | Fetched when the app asks, cached ~20 minutes |
| nflverse (GitHub releases) | Game logs, injury reports, closing lines for finished games, schedule | Updated by nflverse through the week |
| FantasyPros weekly consensus (via dynastyprocess) | Expert rankings, best/worst rank, start/sit grade | The file is checked against the week it belongs to (matched by kickoff times). If it is still last week's, it is withheld and shown as "not published yet" |
| Open-Meteo | Wind and temperature at kickoff | Forecast fetched per stadium |
| Sleeper | Rosters, leagues, projections | Live |

Every source carries a timestamp and a status (fresh, aging, waiting). The **data pulse** on the Week, Slate and Players screens and the Proof screen show them. Nothing stale is shown as if it were current.

The active week is the first week that still has an unfinished game, so Sunday and Monday night games keep the app on the right week.

## How a projection is built

For QB, RB, WR and TE: a stat model (recent form, plus the signals below) is blended with the expert consensus (and a share of Sleeper's projection). Weights per position came from the backtest. Kickers and defenses are estimated from the game line and are labeled "estimate"; they are not backtested.

### Backtest (research/backtest.py, 2021-2025 plus 2026 weeks 1-3)

Leave-one-season-out, with an ablation for each signal: a signal is kept only if removing it hurt in at least 4 of 6 tests and by at least 0.15% on average.

- Kept: Vegas team total (all positions), workload (targets, carries, target share; RB/WR/TE, helped 6 of 6), wind and cold (QB only), opponent defense rating (TE and QB, small effect).
- Left out: point spread, home field for RB/WR/TE, opponent rating for RB/WR. They did not help reliably.
- Experts beat a stats-only model nearly every season, so the app blends them. Blend weights (model/experts): QB .28/.72, RB .29/.71, WR .17/.83, TE .36/.64.
- One game is hard to predict (R^2 of roughly 0.09 to 0.37), so every projection is a range. Ranges are calibrated: the 10th-to-90th range contained the real score ~80% of the time.
- Head-to-head calibration is in coefs.js and drives the "X% to score more" figures on Compare.

Sportsbook props could not be backtested (no free historical archive), so they are not used.

## History capture, health checks and diagnostics

Some of what the app reads cannot be rebuilt later: how a betting line moved, when a ranking changed, who was listed Questionable on Friday. `capture-scheduled` wakes every 15 minutes, checks the calendar (Eastern time) and does nothing unless something is due.

| When | Lines, injuries, weather | Rankings |
| --- | --- | --- |
| Within a game window (Thursday night, Sunday from 8:30 AM, Monday night, or within 2 hours before to 4 hours after any kickoff it has seen) | every 15 minutes | hourly |
| Other hours on Thursday, Sunday and Monday | hourly | hourly |
| Wednesday, Friday, Saturday | every 3 hours | every 3 hours |
| Tuesday | every 6 hours | every 6 hours |

Sleeper's add and drop trends are read once a day after 6 AM. Only changes are stored: a row is added when a game's line (or a player's rank, status or forecast) differs from its last row. One small document per week and kind lives in the `capture` Blobs store (`lib/capture.mjs` explains the layout). `/api/capture` shows what is saved and when each kind last ran; `/api/capture?kind=lines&season=2026&week=4` returns the rows.

**Health checks.** `lib/shape.mjs` checks the format of every source (the field names ESPN, FantasyPros, nflverse, Sleeper and Open-Meteo return). A source that still answers but changed its format gets a red dot and a plain note in the freshness pill, instead of silently showing nothing. The capture job saves the verdicts as `health` rows.

**Diagnostics.** `/api/diag` walks the same steps the app does for kickers and defenses (player list, game, line, projection) and states where each drops out, with counts. Open it when a tab looks empty.

**Kickers and defenses.** Defenses are matched to expert ranks by team abbreviation (Sleeper's id for a defense), and kickers the id table lacks are matched by name and team. On the Players screen the K and DST tabs always list everyone and say why a row has no number.

## Running record

`snapshot-scheduled` runs every 3 hours. For each player it saves the inputs the model had **before** that player's team kicked off, and freezes them at kickoff. `/api/accuracy` grades those frozen rows against actual PPR points for four sources (blend, our model, experts, Sleeper) and reports error, bias and range coverage. After two graded weeks (at least 200 player pairs) it tunes how much Sleeper counts inside the consensus (starting guess: 35%). Results appear on the Proof screen.

## Deploy

1. Push to a Git repo and connect it to Netlify, or use the Netlify CLI. No build step is needed (`publish = public`, functions in `netlify/functions`).
2. Optional environment variable: `INVITE_CODE` (if set, new accounts must enter it).
3. Netlify Blobs (accounts, profiles, frozen snapshots) needs no setup on Netlify.
4. Local development: `npx netlify dev`. Without Blobs configured, storage falls back to memory.

### Netlify free-plan budget

The free plan is a monthly pool of credits, and going over it pauses the site until the month resets. Production deploys, function compute and bandwidth all draw from it. This app is light (a scheduled function every 3 hours, small JSON responses), but deploys are the easy way to burn credits: batch your changes into a few deploys instead of pushing after every edit. Check Netlify's current pricing page for exact figures; they change.

## Files

- `public/` static app: `js/model.js` (shared projection model, also used by the server), `js/coefs.js` (generated by the backtest), `js/engine.js` (lineup optimizer, waivers, trades, signals), `js/charts.js` (all visuals), `js/views/*` (screens), `styles.css`, self-hosted Archivo font.
- `netlify/functions/` `feed` (all live data for a week), `usage` (game logs and opponent ratings), `accuracy`, `snapshot-scheduled`, `capture-scheduled` and `capture` (history), `diag`, `players`, `outlook`, `sleeper` (proxy), `auth`, `profile`. Shared code in `lib/`: `shape` (format checks), `capture` (cadence and storage), `sources`, `espn`, `weather`.
- `research/` backtest script and results.

## Known limits

- ESPN, Sleeper projections and Open-Meteo were not reachable from the environment this was built in, so those live calls were tested against recorded shapes. If one fails in production, the pulse shows it as waiting and the app keeps working without it.
- FantasyPros publishes Tuesday or Wednesday. Until then a new week runs on the stat model and Sleeper, and the app says so.
- Forecast wind is at 10 m and approximate, not a reading from the field.
- Kicker and defense numbers are untested estimates.
- The capture job depends on Netlify running a 15-minute schedule and on its 30-second limit for scheduled functions. A run that cannot finish says so in the function log and the next tick retries. Check Logs, then Functions, then capture-scheduled after the first deploy.
- Netlify Blobs storage limits were not confirmed. A week of captured history is roughly 25 KB in testing, but real weeks will differ.
- Snap counts are not used. The Sleeper share inside the consensus is an untested starting value until enough weeks are graded.
- Injury news after the last refresh can change everything; check status near kickoff.
