import { cached } from "./util.mjs";
import { parseCsv } from "./schedule.mjs";

// Is an NFL season on? The scheduled jobs only have work to do from about a week before the first game of the regular season until a few days after
// the last one. Outside that window they should do nothing at all, not pull files that cannot have changed.
// Pure: gamedays are "YYYY-MM-DD" strings from the schedule.
export function seasonWindow(gamedays, now = Date.now(), { before = 7, after = 3 } = {}) {
  const D = 864e5; let next = null, last = null, active = false;
  for (const g of gamedays) {
    const t = Date.parse(`${g}T12:00:00Z`); if (!isFinite(t)) continue;
    if (t >= now - after * D && t <= now + before * D) active = true;
    if (t >= now && (next === null || t < next)) next = t;
    if (t < now && (last === null || t > last)) last = t;
  }
  return { active, nextGame: next ? new Date(next).toISOString().slice(0, 10) : null, lastGame: last ? new Date(last).toISOString().slice(0, 10) : null };
}

// Reads the regular-season calendar (cached for 12 hours). If the calendar cannot be read, assume it is in season: missing a week of data is worse than one wasted pull.
export async function seasonActive(now = Date.now()) {
  try {
    const days = await cached("gamedays-v1", 12 * 3600e3, async () => {
      const r = await fetch("https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv", { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`nflverse schedule ${r.status}`);
      const y = new Date(now).getUTCFullYear();
      return parseCsv(await r.text()).filter((g) => g.game_type === "REG" && Number(g.season) >= y - 1 && g.gameday).map((g) => g.gameday);
    });
    return seasonWindow(days, now);
  } catch (e) { return { active: true, nextGame: null, lastGame: null, reason: `calendar unavailable (${e.message}); running as if in season` }; }
}
