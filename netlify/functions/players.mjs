import { json, fail, cached, sleeper } from "./lib/util.mjs";

const POS = new Set(["QB", "RB", "WR", "TE", "K", "DEF"]);

// Sleeper asks that the full player dump be pulled at most once a day, so it is cached for 20 hours.
export async function loadPlayers() {
  return cached("players-v2", 20 * 3600e3, async () => {
    const raw = await sleeper("players/nfl");
    const out = {};
    for (const [id, p] of Object.entries(raw)) {
      const pos = p.position || (p.fantasy_positions || [])[0];
      if (!POS.has(pos)) continue;
      if (pos !== "DEF" && !p.team && p.status !== "Active") continue;
      out[id] = {
        n: pos === "DEF" ? `${p.first_name || ""} ${p.last_name || ""}`.trim() || id : p.full_name || `${p.first_name} ${p.last_name}`,
        p: pos,
        t: p.team || (pos === "DEF" ? id : null),
        a: p.age ?? null,
        x: p.years_exp ?? null,
        i: p.injury_status || null,
        d: p.depth_chart_order ?? null,
        r: p.search_rank ?? 9999,
        g: p.gsis_id || null,
      };
    }
    return out;
  });
}

export default async () => {
  try {
    const players = await loadPlayers();
    return json(players, 200, { "cache-control": "public, max-age=3600", "netlify-cdn-cache-control": "public, durable, max-age=3600, stale-while-revalidate=86400" });
  } catch (e) {
    return fail(`Couldn't load the player list: ${e.message}`, 502);
  }
};
