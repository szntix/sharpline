import { getJson } from "./util.mjs";
import { abbr } from "./teams.mjs";
import { checkEspn } from "./shape.mjs";

// ESPN's public scoreboard: schedule, live scores, DraftKings lines (open and current), weather, venue.
// Undocumented but keyless. Once a game is final ESPN drops its odds, so finished games get their
// closing lines from the nflverse schedule instead (see feed.mjs).
const BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const num = (s) => { const m = String(s ?? "").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

export function parseEvent(ev) {
  const c = ev?.competitions?.[0]; if (!c) return null;
  const home = c.competitors?.find((x) => x.homeAway === "home"), away = c.competitors?.find((x) => x.homeAway === "away");
  if (!home || !away) return null;
  const st = c.status?.type || ev.status?.type || {};
  const o = c.odds?.[0];
  let line = null;
  if (o) {
    // ESPN prints the home line: "-3.5" = home favored by 3.5. We store spread as positive when the home team is favored.
    const homeClose = num(o.pointSpread?.home?.close?.line), homeOpen = num(o.pointSpread?.home?.open?.line);
    let spread = homeClose != null ? -homeClose : null;
    if (spread == null && o.spread != null) spread = (o.homeTeamOdds?.favorite ? 1 : -1) * Math.abs(o.spread);
    const total = num(o.total?.over?.close?.line) ?? (typeof o.overUnder === "number" ? o.overUnder : null);
    if (spread != null && total != null) line = {
      book: o.provider?.name || "Sportsbook", spread, total,
      spreadOpen: homeOpen != null ? -homeOpen : null, totalOpen: num(o.total?.over?.open?.line),
      mlHome: num(o.moneyline?.home?.close?.odds), mlAway: num(o.moneyline?.away?.close?.odds),
    };
  }
  const w = ev.weather;
  return {
    id: String(ev.id), week: ev.week?.number ?? null, kickoff: ev.date ? new Date(ev.date).toISOString() : null,
    home: abbr(home.team.abbreviation), away: abbr(away.team.abbreviation),
    homeScore: home.score != null && home.score !== "" ? Number(home.score) : null, awayScore: away.score != null && away.score !== "" ? Number(away.score) : null,
    status: { state: st.state || "pre", completed: !!st.completed, detail: st.shortDetail || st.detail || "" },
    venue: { name: c.venue?.fullName || "", indoor: !!c.venue?.indoor, neutral: !!c.neutralSite },
    records: { home: home.records?.[0]?.summary || "", away: away.records?.[0]?.summary || "" },
    tv: ev.broadcast || c.broadcast || "",
    weather: w ? { text: w.displayValue || "", temp: typeof w.temperature === "number" ? w.temperature : null } : null,
    line,
  };
}

export async function scoreboard({ week, dates } = {}) {
  const qs = new URLSearchParams({ limit: "100" });
  if (week) { qs.set("week", week); qs.set("seasontype", "2"); }
  if (dates) qs.set("dates", dates);
  const d = await getJson(`${BASE}?${qs}`);
  const games = (d.events || []).map(parseEvent).filter(Boolean);
  return { week: d.week?.number ?? games[0]?.week ?? null, season: d.season?.year ?? null, games, shape: checkEspn(d, games) };
}

// The week people care about: the first one that still has an unfinished game.
export async function activeWeek() {
  const cur = await scoreboard();
  const done = cur.games.length > 0 && cur.games.every((g) => g.status.completed);
  return { week: Math.min(18, (cur.week || 1) + (done ? 1 : 0)), espnWeek: cur.week, season: cur.season, current: cur };
}
