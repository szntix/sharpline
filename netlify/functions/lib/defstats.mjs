import { abbr } from "./teams.mjs";
import { checkColumns } from "./shape.mjs";

// Team defense by game, for the defense and kicker profile pages.
// Reads the same nflverse weekly player file the rest of the app uses, but keeps the DEFENDERS (which the player model ignores)
// and adds each team's defensive counting stats up per game. Yards allowed come from the opponent's offensive rows.
// Parsed in the same pass as the player rows (history.mjs loadWeekly) and shipped inside the team table: no endpoint of its own.
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
