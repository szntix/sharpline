import { runCapture } from "./lib/capture.mjs";
import { buildFeed } from "./feed.mjs";
import { sleeper } from "./lib/util.mjs";
import { seasonActive } from "./lib/season.mjs";

// Wakes every 15 minutes, checks the calendar, and does nothing unless something is due: every 15
// minutes inside a game window, hourly on other game days, every few hours midweek. Whatever it
// fetches goes through the same feed the app uses, then only the changes are saved (lib/capture.mjs).
export const config = { schedule: "*/15 * * * *" };

// Netlify stops a scheduled function after 30 seconds. Give up a little earlier so the reason lands in
// the logs, and the next 15-minute tick simply tries again (a failed run does not mark anything as done).
const within = (promise, ms, what) => {
  let timer; const clock = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${what} took longer than ${ms / 1000} seconds`)), ms); });
  return Promise.race([promise, clock]).finally(() => clearTimeout(timer));
};

export default async () => {
  const season = await seasonActive();
  if (!season.active) return new Response(JSON.stringify({ ok: true, skipped: "off-season", nextGame: season.nextGame, lastGame: season.lastGame }), { headers: { "content-type": "application/json" } });
  const out = await runCapture({
    loadFeed: () => within(buildFeed(), 24000, "assembling the feed"),
    loadTrends: () => within(Promise.all([sleeper("players/nfl/trending/add?lookback_hours=24&limit=200"), sleeper("players/nfl/trending/drop?lookback_hours=24&limit=200")]).then(([add, drop]) => ({ add, drop })), 12000, "reading Sleeper trends"),
  });
  if (!out.skipped || !out.ok) console.log(JSON.stringify(out));    // shows up in Netlify's function logs
  return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
};
