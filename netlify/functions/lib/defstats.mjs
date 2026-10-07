import { getTextConditional, cachedConditional, nflState } from "./util.mjs";
import { abbr } from "./teams.mjs";
import { schedule } from "./schedule.mjs";
import { checkColumns } from "./shape.mjs";

// Team defense by game, for the defense and kicker profile pages.
// Reads the same nflverse weekly player file the rest of the app uses, but keeps the DEFENDERS (which the player model ignores)
// and adds each team's defensive counting stats up per game. Yards allowed come from the opponent's offensive rows.
// It is its own endpoint with its own cache on purpose: a slow or failed download here can never take down the team table or schedule.
const NFLV = "https://github.com/nflverse/nflverse-data/releases/download";
// Order of the numbers in each game row. The client reads them by this order.
export const FIELDS = ["sk", "hit", "int", "fr", "ff", "tfl", "pd", "td", "saf", "blk", "stt", "py", "ry", "sks", "gv"];
const DEF_COLS = ["def_sacks", "def_qb_hits", "def_interceptions", "fumble_recovery_opp", "def_fumbles_forced", "def_tackles_for_loss", "def_pass_defended", "def_tds", "def_safeties"];
const BLOCK_COLS = ["def_punt_blocks", "def_pat_blocks", "def_fg_blocks"];
const OFF_COLS = ["sacks_suffered", "passing_interceptions", "fumbles_lost_total"];     // the team's OWN offense: sacks taken, and giveaways = interceptions thrown + fumbles lost
const REQUIRED = ["season_type", "week", "team", "opponent_team", "passing_yards", "rushing_yards", ...DEF_COLS, ...OFF_COLS];

function splitLine(line) {
  if (!line.includes('"')) return line.split(",");
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out;
}

// text -> { TEAM: [[week, opponent, sk, hit, int, fr, ff, tfl, pd, td, saf, blk, stt, py, ry, sks, gv], ...] } in week order. stt = special-teams touchdowns; sks and gv are the team's OWN offense (sacks taken; giveaways = interceptions thrown + fumbles lost)
export function parseDefStats(text) {
  const lines = text.split("\n"), head = splitLine(lines[0].replace(/\r$/, "")), ix = Object.fromEntries(head.map((h, i) => [h, i]));
  const chk = checkColumns(head, REQUIRED, "the nflverse player stats file"); if (!chk.ok) throw new Error(chk.problems.join("; "));
  const acc = {}, slot = (tm, wk, op) => (acc[`${tm}|${wk}`] ||= { tm, wk, op, v: new Array(FIELDS.length).fill(0) });
  const num = (c, k) => (ix[k] != null ? +c[ix[k]] || 0 : 0);
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]; if (!l) continue;
    const c = splitLine(l.replace(/\r$/, "")); if (c[ix.season_type] !== "REG") continue;
    const wk = +c[ix.week], tm = abbr(c[ix.team]), op = abbr(c[ix.opponent_team]); if (!wk || !tm || !op) continue;
    const d = slot(tm, wk, op).v;                                                       // what this player did for HIS team's defense
    d[0] += num(c, "def_sacks"); d[1] += num(c, "def_qb_hits"); d[2] += num(c, "def_interceptions"); d[3] += num(c, "fumble_recovery_opp"); d[4] += num(c, "def_fumbles_forced");
    d[5] += num(c, "def_tackles_for_loss"); d[6] += num(c, "def_pass_defended"); d[7] += num(c, "def_tds"); d[8] += num(c, "def_safeties"); for (const k of BLOCK_COLS) d[9] += num(c, k); d[10] += num(c, "special_teams_tds"); d[13] += num(c, "sacks_suffered"); d[14] += num(c, "passing_interceptions") + num(c, "fumbles_lost_total");
    const o = slot(op, wk, tm).v; o[11] += num(c, "passing_yards"); o[12] += num(c, "rushing_yards");   // what his offense gained against the OTHER team's defense
  }
  const out = {};
  for (const r of Object.values(acc)) (out[r.tm] ||= []).push([r.wk, r.op, ...r.v.map((x) => Math.round(x * 10) / 10)]);
  for (const t of Object.keys(out)) out[t].sort((a, b) => a[0] - b[0]);
  return out;
}

const fetcher = (season) => async (etag) => {
  const r = await getTextConditional(`${NFLV}/stats_player/stats_player_week_${season}.csv`, etag, { timeout: 45000 });
  return r.text != null ? { data: parseDefStats(r.text), etag: r.etag } : r;
};

// The season to show: the current one, or last season's while the new schedule is not out and no game has been played.
export async function computeDefStats() {
  const state = await nflState(); let season = Number(state.season), fallback = null;
  let data = await cachedConditional(`def3-${season}`, 50 * 60e3, fetcher(season), { empty: {} });
  if (!Object.keys(data || {}).length) {
    const cur = await schedule(season).catch(() => []);
    if (!cur.some((g) => g.hs != null)) { const prev = await cachedConditional(`def3-${season - 1}`, 30 * 864e5, fetcher(season - 1), { empty: {} }); if (Object.keys(prev || {}).length) { fallback = { season: season - 1, wanted: season }; data = prev; season -= 1; } }
  }
  const teams = data || {}, through = Math.max(0, ...Object.values(teams).flatMap((g) => g.map((r) => r[0])));
  return { season, throughWeek: through, asOf: Date.now(), fields: FIELDS, teams, ...(fallback ? { fallback } : {}) };
}
