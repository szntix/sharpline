// "Did the source change its format?" checks.
//
// Every outside source is unofficial or third-party, so the failure we fear most is silent: the
// request still succeeds, but a field was renamed and the app quietly shows nothing. Each check
// returns { ok, problems }. The feed turns a failed check into a red freshness dot with a plain
// explanation. A check never throws and never blocks the feed.

const result = (problems) => ({ ok: problems.length === 0, problems });

export function checkColumns(cols, required, label) {
  const have = new Set(cols || []);
  const missing = required.filter((c) => !have.has(c));
  return result(missing.length ? [`${label} is missing columns: ${missing.join(", ")}`] : []);
}

// ESPN's undocumented scoreboard. `raw` is the JSON, `games` is what we parsed out of it.
export function checkEspn(raw, games = []) {
  const p = [];
  if (!raw || typeof raw !== "object") return result(["the response was not JSON"]);
  if (!Array.isArray(raw.events)) { p.push("no events list"); return result(p); }
  if (raw.events.length) {
    const ev = raw.events[0], c = ev?.competitions?.[0];
    if (!ev.date) p.push("events have no kickoff date");
    if (!c) p.push("events have no competitions");
    else {
      if (!Array.isArray(c.competitors) || c.competitors.length < 2) p.push("games list no competitors");
      else if (!c.competitors.every((x) => x?.team?.abbreviation && x.homeAway)) p.push("competitors are missing a team or home/away flag");
      if (!c.status?.type && !ev.status?.type) p.push("games have no status");
    }
    if (raw.events.length > games.length) p.push(`${raw.events.length - games.length} of ${raw.events.length} games could not be read`);
    const priced = raw.events.filter((e) => e?.competitions?.[0]?.odds?.length).length;
    if (priced > 0 && !games.some((g) => g.line)) p.push("odds are present but could not be read");
  }
  return result(p);
}

export const ECR_COLS = ["pos", "ecr", "best", "worst", "sd", "team", "fantasypros_id", "scrape_date", "player_game_kickoff_ts", "player_owned_avg"];
export const INJ_COLS = ["gsis_id", "week", "position", "report_status", "practice_status", "report_primary_injury"];

// FantasyPros weekly rankings as republished by dynastyprocess. Column names first; row counts per
// position only when the file is fresh (in the offseason a thin file is normal, not broken).
const MIN_ROWS = { QB: 15, RB: 30, WR: 50, TE: 15, K: 20, DST: 20 };
export function checkEcr(cols, counts, scrapedAt, now = Date.now()) {
  const c = checkColumns(cols, ECR_COLS, "the rankings file");
  const p = [...c.problems];
  const fresh = scrapedAt && now - Date.parse(scrapedAt) < 8 * 864e5;
  if (fresh && !p.length) {
    for (const [pos, min] of Object.entries(MIN_ROWS)) if ((counts[pos] || 0) < min) p.push(`only ${counts[pos] || 0} ${pos} rows (expected at least ${min})`);
  }
  return result(p);
}

export function checkInjuries(cols) { return checkColumns(cols, INJ_COLS, "the injury file"); }

// Sleeper's projections: a list (or map) of players, each with a stats object that has points in it.
export function checkProjections(raw) {
  const rows = Array.isArray(raw) ? raw : Object.values(raw || {});
  if (!rows.length) return result([]);                       // empty is "not published yet", not a format change
  const sample = rows.slice(0, 40);
  const withStats = sample.filter((r) => r && typeof (r.stats ?? r) === "object" && Object.keys(r.stats ?? r).length).length;
  const withPoints = sample.filter((r) => Number.isFinite(Number((r.stats ?? r).pts_ppr))).length;
  const p = [];
  if (!withStats) p.push("projection rows have no stats");
  else if (!withPoints) p.push("projection rows have no pts_ppr value");
  return result(p);
}

// Open-Meteo's hourly forecast.
export function checkWeather(d) {
  const p = [], h = d?.hourly;
  if (!h) return result(["no hourly block"]);
  for (const k of ["time", "temperature_2m", "wind_speed_10m", "wind_gusts_10m"]) if (!Array.isArray(h[k]) || !h[k].length) p.push(`hourly.${k} is missing`);
  return result(p);
}

// Raised by loaders that spot a bad shape mid-parse; the feed reads the "shape:" prefix.
export class ShapeError extends Error { constructor(msg) { super(`shape: ${msg}`); } }

// Fold a list of { key, shape } into one record per source, for the feed's health report.
export function summarize(parts) {
  const out = {};
  for (const [key, s] of Object.entries(parts)) if (s) out[key] = { ok: s.ok, problems: s.problems || [] };
  return out;
}
