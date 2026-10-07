import { abbr } from "./teams.mjs";
import { checkColumns } from "./shape.mjs";

// Every kicker's season, kick by kick, for the kicker profile page: distances of each field goal made or missed (blocked kicks count as missed), extra points.
// Parsed in the same pass as the player rows (history.mjs loadWeekly) and shipped inside the usage payload: no endpoint of its own.
const REQUIRED = ["season_type", "position", "player_id", "player_display_name", "week", "team", "opponent_team", "fg_made_list", "fg_missed_list", "fg_blocked_list", "pat_made", "pat_att"];

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
const dist = (s) => (s ? s.split(";").map((x) => Math.round(+x)).filter((x) => x > 0 && x < 100) : []);

// text -> { gsisId: { n: name, t: latest team, g: [[week, team, opponent, made[], missed[], xpMade, xpTried], ...] } }, games in week order
export function parseKStats(text) {
  const lines = text.split("\n"), head = splitLine(lines[0].replace(/\r$/, "")), ix = Object.fromEntries(head.map((h, i) => [h, i]));
  const chk = checkColumns(head, REQUIRED, "the nflverse player stats file"); if (!chk.ok) throw new Error(chk.problems.join("; "));
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]; if (!l) continue;
    const c = splitLine(l.replace(/\r$/, "")); if (c[ix.season_type] !== "REG" || c[ix.position] !== "K") continue;
    const wk = +c[ix.week], tm = abbr(c[ix.team]), op = abbr(c[ix.opponent_team]), id = c[ix.player_id]; if (!wk || !tm || !id) continue;
    (out[id] ||= { n: c[ix.player_display_name] || "", t: tm, g: [] }).g.push([wk, tm, op || "", dist(c[ix.fg_made_list]), [...dist(c[ix.fg_missed_list]), ...dist(c[ix.fg_blocked_list])], +c[ix.pat_made] || 0, +c[ix.pat_att] || 0]);
  }
  for (const k of Object.values(out)) { k.g.sort((a, b) => a[0] - b[0]); k.t = k.g[k.g.length - 1][1]; }
  return out;
}
