import { json, fail } from "./lib/util.mjs";
import { computeKStats } from "./lib/kstats.mjs";

// Every kicker's season kick by kick (distances made and missed, extra points). Loaded only when a kicker profile is opened.
export default async () => {
  try { return json(await computeKStats(), 200, { "cache-control": "public, max-age=300", "netlify-cdn-cache-control": "public, durable, max-age=900, stale-while-revalidate=1800" }); }
  catch (e) { return fail(`Kicker stats unavailable: ${e.message}`, 502); }
};
