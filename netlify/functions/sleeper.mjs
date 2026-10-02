import { json, fail, sleeper, cached, userFromRequest } from "./lib/util.mjs";

// Read-only proxy for the public Sleeper API, limited to the paths the app uses.
const ALLOWED = [
  /^state\/nfl$/,
  /^user\/[A-Za-z0-9_]+$/,
  /^user\/\d+\/leagues\/nfl\/\d{4}$/,
  /^league\/\d+$/,
  /^league\/\d+\/(rosters|users)$/,
  /^league\/\d+\/matchups\/\d{1,2}$/,
  /^players\/nfl\/trending\/(add|drop)$/,
];

export default async (req) => {
  if (!(await userFromRequest(req))) return fail("Sign in to look up Sleeper leagues.", 401);
  const url = new URL(req.url);
  const path = (url.searchParams.get("path") || "").replace(/^\/+/, "");
  if (!ALLOWED.some((r) => r.test(path))) return fail("Path not allowed");
  const qs = new URLSearchParams(url.searchParams); qs.delete("path");
  const fresh = qs.get("fresh") === "1"; qs.delete("fresh");      // a manual refresh skips the short server cache; the flag is never sent on to Sleeper
  const full = qs.toString() ? `${path}?${qs}` : path;
  try {
    const ttl = fresh ? 0 : path.startsWith("players/") ? 30 * 60e3 : 2 * 60e3;
    const data = await cached(`sleeper:${full}`, ttl, () => sleeper(full));
    return json(data);
  } catch (e) {
    return fail(e.message, 502);
  }
};
