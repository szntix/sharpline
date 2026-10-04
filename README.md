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

## Design

A quiet neutral frame with turf green as the brand, and color only where it carries meaning.

- **Who:** six position colors (QB red-orange, RB light green, WR deep blue, TE yellow, K violet, DST brown), chosen so the worst pair stays 15 or more apart under every color-vision type, and every chip carries its letters. Each team has a color and a logo plate; the logo sits over the team letters, and if it fails to load the letters remain.
- **How likely:** one red-to-green scale for every chance (win chance, chance of a big game, percentiles). Red is darker than green so the two stay apart for red-green color-blind viewers, and the number is always printed beside the shade. Amounts with no good or bad stay neutral.
- **Frame:** soft neutrals in light and dark, 1 px outlines, a faint shadow in light mode. A stronger edge is kept only where a boundary is what identifies a control or a selected state. Selection is a raised pill, and position bars take that position's color.
- **Sizes:** nothing under 12 px, controls 44 px tall (segments at least 40 px wide), and 7 to 8 player rows fit on a 390 by 844 phone.
- **Rows:** every row is a solid slate color and exactly two lines, so nothing is taller than anything else. The team shows only as a stripe on the left edge, beside its logo plate. Injury status is the ring chip beside the name; any other condition is at most two short tags on the right of the second line (Shootout, Model +4.5, Running hot). The full sentence for each tag is on the player page and is read out to screen readers.
- **Slate bars:** each side's bar is its team's color (chosen to stay visible in light and dark) and splits the game's expected points between the two teams. Both team columns are a fixed width, so every bar starts and ends in the same place.
- **Side by side (Compare):** in each row the better value is a solid bar in that player's team color and fills its half; the other is an outline at its true proportion. For expert rank, lower is better, so the bar grows as the rank number shrinks. If either side has no number, the row shows both values and no bars.
- **Team color on rows:** off by default (plain slate rows with a team stripe). Leagues, Account and data, has a switch at the bottom to tint each row and the player card with the team's color; the choice is remembered on the device.
- **Dropdowns:** Sort and Show act only when an option is chosen (`data-change`), never on the tap that opens them, so opening and dismissing a dropdown changes nothing.
- **Version:** the build number shows in Leagues, Account and data, on any error screen, and at `/version.json`, so it is always clear which build is live.
- **Players sort:** Blended (the projection we show), Our model (the stat model alone, with its own number on each row; players it does not cover come last), Expert rank, and We like more. A one-line note under the bar says what the order means, using the real weights for the position you are on.
- **Moves:** one 12 px rhythm down the page. Every list row has a fixed number column, so numbers, gain tags and buttons line up from row to row. Waiver rows show the gain in the action row, trade ideas show Give and Get on separate lines, and Hot and cold rows use the same plate, name and number as everywhere else.
- **Compare:** one shared "score at least X" line across both players. Tap 10+, 15+ and so on, or drag the line on either plot; both plots, both captions and the chips move together, and the line is remembered for that pair. On a phone the "who scores more" verdict sits in a strip under the two team panels so each team gets half the width and long names wrap instead of clipping.
- **Team logos without a pale disc:** the logo is drawn as a one-color silhouette using CSS filters on the same image. Compare and Game panels carry a large soft watermark that always pushes the panel away from its text color (dark mark under white text, light mark under dark text), so it can only raise contrast. The Player card has a faint corner mark. Small team-color badges above the Compare plots show the logo in white (or black) on the team color. If a logo cannot load, nothing is left behind and the team letters show instead.
- **Readable text on every team color:** text on a team-color plate or panel is held to 4.5:1 for all 32 teams. Two mid-tone brand colors (Carolina and the Chargers) are nudged by about 7 of 441 RGB units for this; every team's stripe keeps its exact brand color. The Player card uses a lighter team tint (6%) than list rows (12%) because it also carries the watermark.
- **Trades:** every player in trade ideas, in the You give and You get chips, and in the menus carries a colored position chip. Reviewing a trade shows "Your roster after the trade" (or the other team's, with a toggle): starters in slot order, bench, and who is leaving, with New, Moves up and Moves to bench tags and a plain reason when an incoming player is not cracking the lineup ("Behind Henry by 2.2"). It uses the same lineup optimizer and the same per-game rest-of-season values as the verdict above it, so the numbers cannot disagree.
- **Position tabs:** ALL, QB, RB, WR, TE, FLEX, K, DST are all written in capitals. A selected single position fills with its color; a selected ALL or FLEX (a group) is the same neutral pill, with no gradient strip. The FLEX slot chip on lineups uses the same capitals.
- **Editing a league:** Edit scrolls straight to the editor and turns into Close, so a tap always shows a result even with several leagues. Manual leagues also have Edit roster (jumps to the roster panel) and an Edit roster link under the bench on Week. The editor has a jump row (My roster, Starting lineup, Scoring, Other teams) and a Done button at the top. Every control in the editor, including each remove button, has a touch area of at least 44 px, and removing a player says who was removed.
- **Trade ideas never go silent:** a suggestion must improve your lineup by more than 1 point over the season and theirs by more than 0.5, at similar value, across two positions, so it needs a position where you hold more than your lineup uses. When there are none, the screen says so with a count of where each possible swap fell out (same position, would not improve yours, improves yours but not theirs, too lopsided), and "Worth a pitch" lists up to five deals that help you but not them, labeled "they lose" or "they break even". In a league with no other teams (a custom league), it says trade ideas need them and offers Add other teams. The suggestions themselves are unchanged from the original build (checked on 41 leagues).
- **Opening screen:** a turf field with the logo's yard lines and ball, matching the phone's own launch screen (manifest background is turf green), held until the app draws its first screen, with a 12-second safety timer.
- **Trade values:** a player at or below replacement level reads "depth" and a player with no projection reads "no projection", instead of a bare 0. Dynasty and keeper leagues show ages in the trade builder, and the league editor explains each league type. The aging curve now keeps declining past its last listed age (it used to go flat, which over-valued players over 30 in dynasty).
- **Trade value counts depth:** when the league's rosters are known, value is points above the best free agent actually available at that position (never above the old starting-lineup estimate), so bench depth that beats the waiver wire has a number.
- **Suggestions follow the calculator:** with a player only in You get, the list becomes "Ways to get him" (each of your players for him, best for your lineup first); with a player only in You give, "What he could bring back". A free agent gets "add him without a trade". Review loads the full swap.
- **Projections from:** one control, in Settings (Blended, Our model, Experts, Sleeper), drives every number and lineup in the app; Blended is the tested default. When it is not Blended, a strip under the header on every screen says so, with Use Blended and Settings. Week has no switch; it shows the four sources' lineups side by side where they disagree and what each alternative gives up by the Blended numbers. A player a source does not cover keeps his Blended number.
- **Role check:** the stat model reads past usage and cannot see who is starting now. When the experts project a player at less than half of the model's number (typically a backup whose history comes from old starts), the model sits him out that week: the blend uses the experts, Our model keeps his Blended number, and his page says why.
- **Availability:** on the official injury report, Questionable counts 80% and Doubtful 0% (tested: about 1% less projection error than the earlier rule, roughly half a point a week). A Sleeper-only status keeps the earlier rule (Questionable 100%, Doubtful 25%), and within 90 minutes of kickoff a Questionable player who has not been ruled out counts as playing.
- **Advanced stats:** from the nflverse weekly file (EPA per dropback, carry and target, CPOE, WOPR, air-yards share, depth of target, yards after catch, catch rate, first downs). The Player page shows them with position percentiles, Compare adds them as rows, and the Game page shows each defense against each position.
- **Compare bars:** each bar is the value against this week's best at the position (a full bar is the leader), with a tick for a typical starter; solid still marks the better of the two.
- **Dropdowns and fields:** every field and dropdown is 16 px (smaller text makes iPhones zoom the page on focus), 44 px tall, labeled, and drawn with the same arrow. Sort and Show are a label with an invisible native picker over it, so the arrow sits right after the text.
- **"You get" and "You give" suggestions:** a swap is kept only if the two sides are within about 30% in value (or 15 points for small values), or it improves both lineups at a price within a factor of two. Each row says which.
- **Sub-menus:** every segmented bar is full width, so stacked bars share the same edges at any screen size, and a segment can never be narrower than its own label (the selected pill always encloses its text). Screens down to 320 px wide fit without sideways scrolling.
- **Range:** the likely range is not shown on list rows (how wide it is follows almost entirely from the projection). On the player page it is a "most weeks" bracket drawn under the dotplot's axis, spanning the middle 80% of the dots, so the words sit on the data. The hero is just the projected number.
- **Slate:** a ranked game list first, with the scatter map one tap away.

Colors and sizes live in `public/styles.css`. Team colors are in `public/js/teams.js`. The red-to-green scale is `chanceColor` in `public/js/charts.js`.

## Position tabs follow the league

The Players and Moves screens show a position tab only if some starting slot in the active league can use it. A league with no kicker or defense slot never sees K or DST, and those players also drop out of the All list. A Flex tab appears when any slot takes more than one position (Flex, W/R, W/T or Superflex) and lists RB, WR and TE. If the tab you were on stops applying after you switch leagues, the screen falls back to All. The rule lives in one place, `positionsFor` in `public/js/scoring.js`.

## How fresh the data is

Everyone sees the same data, because it is cached on the server and not on each phone. Each source has its own window:

| Data | Refreshed | Notes |
| --- | --- | --- |
| Betting lines, scores, game status (ESPN) | Live on every build of the feed | Netlify's CDN reuses one build for 60 seconds across all users, then serves it while rebuilding |
| Expert rankings (FantasyPros via dynastyprocess) | Server copy up to 45 minutes old | The source itself publishes about once a day |
| Sleeper projections, injury reports | Up to 30 minutes | |
| Game logs and opponent ratings | Up to 1 hour | |
| Forecast weather | Up to 3 hours per team and day | |
| Player list, schedule | 20 hours, 12 hours | Sleeper asks for the player list once a day |
| League rosters (Sleeper) | Checked when you open Moves, Players or Week if the saved copy is over 5 minutes old, every 10 minutes while the app stays open, and on demand | The server keeps a copy for 2 minutes; a manual Refresh skips it |

A phone checks again on its own: every minute while a game is live, every 3 minutes from 90 minutes before kickoff to 4 hours after, every 10 minutes otherwise, and whenever you come back to the app. It waits if you are typing or dragging, and it redraws only when a line, score, status or ranking actually changed (`public/js/refresh.js`). The refresh button still forces a check. The capture job (see above) also keeps the server copy warm during game windows.

## League rosters from Sleeper

Who is on each team decides who shows as a free agent, so it has to be current. Rosters are not on a calendar, because adds, drops, trades and waiver results can happen at any time; they are fetched when they are used.

- Opening Moves, Players or Week checks Sleeper if the saved rosters are over 5 minutes old. An app left open re-checks every 10 minutes. After a failure it waits a minute before trying again.
- Moves (and Players, when filtered to free agents or your team) shows "Rosters from Sleeper, checked 3 min ago" with a Refresh link. Leagues has a Refresh rosters button for each Sleeper league. A manual refresh asks the server to skip its 2-minute copy (`fresh=1`).
- A roster is the active list plus injured reserve plus the taxi squad, which Sleeper keeps in separate lists.
- For a synced league Sleeper is the source of truth, so players marked "taken" by hand are cleared on each sync. Manual leagues never call Sleeper.
- If Sleeper cannot be reached, or answers with nothing usable, the saved rosters are kept and the screen says how old they are. A sync never wipes a roster.
- Limit: Sleeper's rosters call shows who is on a team, not who is still locked on waivers after being dropped, so a player dropped yesterday can show as available until waivers clear.

## Matching players to their game logs

The stat model needs a player's game logs, which come from nflverse and are keyed by nflverse's own player id (the `gsis` id). Sleeper's player table is where the app learns who is who, but Sleeper does not document a `gsis` id field, and a player without one used to get no stat-model number and no injury status (the final number then fell back to the experts alone and the row said "experts only").

- The link now combines Sleeper's own id (which wins if it disagrees), the id table the app already downloads for expert rankings (it links 97 to 99 percent of this season's players, one to one), and, for anyone neither covers, a match on the same name and position when exactly one Sleeper player fits. If two players share a name and position nobody is guessed.
- Injury reports use the same link.
- Coverage is visible. `/api/diag` has a "Stat model" line (how many of this season's players are linked, and who is not). The Proof screen shows the same count. A player's own page says why the model has no number: not matched to game logs, fewer than 3 games logged, or game logs not loaded.
- The blend itself is mostly experts by design, because testing over five seasons found experts more accurate than a stats-only model: our model carries 28 percent for QBs, 29 for RBs, 17 for WRs and 36 for TEs. So the Blended order tracks expert rank closely. Use the "Our model" sort for the stat model's own ranking and "We like more" for where it disagrees with the experts.

## Privacy and accounts

- **Signing in and creating an account:** the invite code box is always visible (it is only checked when creating an account), what you typed is kept after a mistake (a wrong PIN clears just the PIN), the cursor lands in the field that needs fixing, the button says "Creating account…" or "Signing in…" while the server works, and the form does not depend on the browser reporting which button was tapped, which older phones do not. A request that takes over 25 seconds stops with a message.
- Each person's leagues, rosters and settings are stored under their own username. `/api/profile` returns only the signed-in user's own profile, answers nothing without a valid session token, and is never cached on the network or the device.
- Sleeper data is public on Sleeper itself: anyone who knows a league ID or Sleeper username can read its rosters there. The app adds no extra exposure, and its Sleeper lookup (`/api/sleeper`) now requires a signed-in user.
- PINs are salted and hashed (PBKDF2). Five wrong PINs lock that username for 15 minutes. Use a PIN of 6 or more digits.
- The person who owns the Netlify account can read everything stored in Blobs, including profiles.
- Endpoints that hold no personal data and need no sign-in: `feed`, `usage`, `players`, `accuracy`, `capture`, `diag`.

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
