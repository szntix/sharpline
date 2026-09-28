import { json, fail } from "./lib/util.mjs";
import { computeUsage } from "./lib/history.mjs";

// Season-to-date opportunity and form, plus every defense's rating against each position.
export default async () => {
  try { return json(await computeUsage(), 200, { "cache-control": "public, max-age=300" }); }
  catch (e) { return fail(`Usage data unavailable: ${e.message}`, 502); }
};
