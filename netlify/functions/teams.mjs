import { json, fail } from "./lib/util.mjs";
import { computeTeams } from "./lib/teamstats.mjs";

// Every team's season so far: record, opponent-adjusted rating, efficiency ranks, pace, volume, and the schedule ahead.
export default async () => {
  try { return json(await computeTeams(), 200, { "cache-control": "public, max-age=300", "netlify-cdn-cache-control": "public, durable, max-age=900, stale-while-revalidate=1800" }); }
  catch (e) { return fail(`Team data unavailable: ${e.message}`, 502); }
};
