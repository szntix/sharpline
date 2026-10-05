import { json, fail, nflState, freshness } from "./lib/util.mjs";
import { scoreboard, activeWeek } from "./lib/espn.mjs";
import { kickoffWeather } from "./lib/weather.mjs";
import { loadEcr, sleeperProj, loadInjuries, nflverseGames, mergeGames } from "./lib/sources.mjs";
import { summarize } from "./lib/shape.mjs";

// One call assembles everything time-sensitive for a week, and stamps every source with its age.
export async function buildFeed(weekParam) {
  const state = await nflState(); const notes = [];
  let season = Number(state.season), week = weekParam ? Number(weekParam) : null, current = null;
  if (!week) {
    try { const a = await activeWeek(); week = a.week; season = a.season || season; current = a.current; }
    catch (e) { week = Number(state.week) || 1; notes.push(`ESPN schedule unavailable (${e.message}); using Sleeper's week.`); }
  }
  let espnGames = [], espnAt = null, espnShape = null;
  try {
    const sb = current && current.week === week ? current : await scoreboard({ week });
    espnGames = sb.week === week ? sb.games : []; espnAt = Date.now(); espnShape = sb.shape || null;
  } catch (e) { notes.push(`ESPN lines unavailable: ${e.message}`); }
  let nfl = []; try { nfl = await nflverseGames(season, week); } catch (e) { notes.push(`nflverse schedule unavailable: ${e.message}`); }
  const games = mergeGames(espnGames, nfl).sort((a, b) => (a.kickoff || a.day || "").localeCompare(b.kickoff || b.day || ""));

  const wxProblems = [];
  const [wx, ecr, proj, inj] = await Promise.all([
    Promise.all(games.map((g) => (g.status.completed ? null : kickoffWeather(g).catch((e) => { if (String(e.message).startsWith("shape:")) wxProblems.push(e.message.slice(7)); return null; })))),
    loadEcr(games).catch((e) => ({ status: "error", players: {}, error: e.message })),
    sleeperProj(season, week).catch((e) => ({ players: {}, error: e.message })),
    loadInjuries(season, week).catch((e) => ({ status: "error", players: {}, error: e.message })),
  ]);
  games.forEach((g, i) => { if (wx[i]) g.forecast = wx[i]; });

  const withLines = games.filter((g) => g.line).length;
  const sources = [
    { key: "lines", label: "Betting lines", asOf: espnAt || null, status: games.length ? (espnAt ? freshness(espnAt, 20 * 60e3) : "aging") : "missing",
      note: withLines ? `${withLines} of ${games.length} games priced` : "Lines not posted yet" },
    { key: "weather", label: "Kickoff forecast", asOf: wx.find(Boolean)?.asOf || null, status: wx.some(Boolean) ? "fresh" : "missing", note: wx.some(Boolean) ? "Wind and temperature at kickoff" : "Indoor games or too far out" },
    { key: "experts", label: "Expert rankings", asOf: ecr.asOf || null, status: ecr.status === "ok" ? freshness(ecr.asOf, 3 * 3600e3) : "missing",
      note: ecr.status === "ok" ? "FantasyPros weekly consensus" : "Not published for this week yet" },
    { key: "proj", label: "Sleeper projections", asOf: proj.fetchedAt || null, status: Object.keys(proj.players || {}).length ? freshness(proj.fetchedAt, 60 * 60e3) : "missing",
      note: Object.keys(proj.players || {}).length ? "What league-mates see" : (proj.error || "Not available") },
    { key: "injuries", label: "Injury reports", asOf: inj.asOf || null, status: inj.status === "ok" ? freshness(inj.asOf, 90 * 60e3) : "missing",
      note: inj.status === "ok" ? "Official practice and game status" : "No report filed for this week yet" },
  ];
  // A source whose format changed gets a red dot and a plain explanation instead of silently showing nothing.
  const shapes = { lines: espnShape, experts: ecr.shape, proj: proj.shape, injuries: inj.shape, weather: wxProblems.length ? { ok: false, problems: [...new Set(wxProblems)] } : null };
  for (const src of sources) { const sh = shapes[src.key]; if (sh && !sh.ok) { src.status = "broken"; src.note = `Format changed: ${sh.problems[0]}`; src.shape = sh; } }
  return { season, week, fetchedAt: Date.now(), games, ecr, proj, injuries: inj, sources, health: summarize(shapes), notes };
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const feed = await buildFeed(url.searchParams.get("week"));
  // For checking the week change afterward: which week ESPN is on, which week we call current, and how many of its games are final.
  try { const a = await activeWeek(); feed.weekInfo = { espn: a.espnWeek, active: a.week, final: a.current.games.filter((g) => g.status.completed).length, total: a.current.games.length }; } catch { feed.weekInfo = null; }
    return json(feed, 200, { "cache-control": "public, max-age=30", "netlify-cdn-cache-control": "public, durable, max-age=60, stale-while-revalidate=120" });
  } catch (e) {
    return fail(`Couldn't assemble this week's data: ${e.message}`, 502);
  }
};
