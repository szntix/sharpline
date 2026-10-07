import { getTextConditional, cachedConditional, nflState } from "./util.mjs";
import { abbr } from "./teams.mjs";
import { schedule } from "./schedule.mjs";
import { checkColumns } from "./shape.mjs";
import { gsisToSleeper } from "./sources.mjs";
import { loadPlayers } from "../players.mjs";

// Every kicker's season, kick by kick, for the kicker profile page: distances of each field goal made or missed (blocked kicks count as missed), extra points.
// Same nflverse weekly player file as the rest of the app, kept as its own endpoint with its own cache so a slow or failed download can only affect the kicker page.
const NFLV = "https://github.com/nflverse/nflverse-data/releases/download";
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
const fetcher = (season) => async (etag) => {
  const r = await getTextConditional(`${NFLV}/stats_player/stats_player_week_${season}.csv`, etag, { timeout: 45000 });
  return r.text != null ? { data: parseKStats(r.text), etag: r.etag } : r;
};
export async function computeKStats() {
  const state = await nflState(); let season = Number(state.season), fallback = null;
  let data = await cachedConditional(`kick1-${season}`, 50 * 60e3, fetcher(season), { empty: {} });
  if (!Object.keys(data || {}).length) {
    const cur = await schedule(season).catch(() => []);
    if (!cur.some((g) => g.hs != null)) { const prev = await cachedConditional(`kick1-${season - 1}`, 30 * 864e5, fetcher(season - 1), { empty: {} }); if (Object.keys(prev || {}).length) { fallback = { season: season - 1, wanted: season }; data = prev; season -= 1; } }
  }
  // Sleeper ids let the page find "his" rows directly. If that lookup fails the rows still go out with sid null and the page matches by name and team instead.
  let g2s = {}; try { g2s = await gsisToSleeper(await loadPlayers()); } catch { g2s = {}; }
  const kickers = {}; for (const [gsis, v] of Object.entries(data || {})) kickers[gsis] = { sid: g2s[gsis] || null, ...v };
  const through = Math.max(0, ...Object.values(kickers).flatMap((k) => k.g.map((r) => r[0])));
  return { season, throughWeek: through, asOf: Date.now(), kickers, ...(fallback ? { fallback } : {}) };
}
