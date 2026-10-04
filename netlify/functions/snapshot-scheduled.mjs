import { store } from "./lib/util.mjs";
import { buildFeed } from "./feed.mjs";
import { computeUsage } from "./lib/history.mjs";
import { loadPlayers } from "./players.mjs";
import { makeRow, gameMap } from "../../public/js/model.js";
import { freezeRow } from "./lib/freeze.mjs";
import { seasonActive } from "./lib/season.mjs";

// Every few hours: refresh the data, and record exactly what the model knew about each player before
// his team kicked off, including the numbers it computed from that. A team's rows freeze the moment its game starts, so grading is never hindsight.
// The last save before kickoff can be up to three hours old, and the record says so.
export const config = { schedule: "0 */3 * * *" };

export default async () => {
  const season = await seasonActive();
  if (!season.active) return new Response(JSON.stringify({ ok: true, skipped: "off-season", nextGame: season.nextGame, lastGame: season.lastGame }), { headers: { "content-type": "application/json" } });
  const [feed, usage, players] = await Promise.all([buildFeed(), computeUsage(), loadPlayers()]);
  const key = `${feed.season}-w${feed.week}`, st = store("frozen");
  const doc = (await st.get(key, { type: "json" }).catch(() => null)) || { season: feed.season, week: feed.week, rows: {} };
  const games = gameMap(feed), now = Date.now(); let updated = 0, frozen = 0;
  for (const id of Object.keys(players)) {
    if (!["QB", "RB", "WR", "TE"].includes(players[id].p)) continue;
    const g = games[players[id].t]; if (!g?.kickoff) continue;
    const old = doc.rows[id]; if (old?.frozen) continue;
    if (Date.parse(g.kickoff) <= now) { if (old) { old.frozen = 1; frozen++; } continue; }
    const row = makeRow(id, { players, usage, feed, games });
    if (!row || (!row.ecr && row.sleeper == null && row.n < 3)) continue;
    doc.rows[id] = freezeRow(row, now); updated++;
  }
  doc.updated = now;
  await st.setJSON(key, doc).catch(() => {});
  return new Response(JSON.stringify({ ok: true, key, updated, frozen, rows: Object.keys(doc.rows).length }), { headers: { "content-type": "application/json" } });
};
