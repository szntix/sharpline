import { json, fail } from "./lib/util.mjs";
import { computeDefStats } from "./lib/defstats.mjs";

// Each team's defense game by game (sacks, QB hits, takeaways, tackles for loss, passes defended, defensive TDs, safeties, blocks,
// and the yards the other team gained). Loaded only when a defense or kicker profile is opened.
export default async () => {
  try { return json(await computeDefStats(), 200, { "cache-control": "public, max-age=300", "netlify-cdn-cache-control": "public, durable, max-age=900, stale-while-revalidate=1800" }); }
  catch (e) { return fail(`Defense stats unavailable: ${e.message}`, 502); }
};
