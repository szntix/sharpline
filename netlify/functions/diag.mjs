import { json, fail } from "./lib/util.mjs";
import { buildFeed } from "./feed.mjs";
import { loadPlayers } from "./players.mjs";
import { computeUsage } from "./lib/history.mjs";
import { gameMap, teamContext, defenseStats, kickerStats, availability, availMult } from "../../public/js/model.js";
import { points, SCORING_PRESETS } from "../../public/js/scoring.js";

// /api/diag: one page that shows, on real data, where kickers and defenses drop out. It walks the
// same steps the app does (player list, game, line, projection) and applies the same test the
// Players tab uses (a row shows only if its projected mean is above zero), using standard PPR scoring.
export default async () => {
  try {
    const [feed, players] = await Promise.all([buildFeed(), loadPlayers()]);
    const s = SCORING_PRESETS.ppr.s, games = gameMap(feed), ids = Object.keys(players);
    const label = { K: "kickers", DEF: "defenses" }, out = {};

    for (const pos of ["K", "DEF"]) {
      const list = ids.filter((id) => players[id].p === pos);
      const r = { inPlayerList: list.length, noGameThisWeek: 0, noLinePosted: 0, zeroProjection: 0, wouldShowOnPlayersTab: 0, withExpertRank: 0, withSleeperProjection: 0 };
      for (const id of list) {
        const p = players[id], g = games[p.t] || null;
        if (feed.ecr?.players?.[id]) r.withExpertRank++;
        if (!g) { r.noGameThisWeek++; continue; }
        const c = teamContext(g, p.t);
        if (!c || c.imp == null) r.noLinePosted++;
        let mean = 0;
        if (pos === "DEF") { const st = defenseStats(c?.imp, c?.oppImp, c?.spread ?? 0); mean = st ? points(st, s, "DEF") : 0; }
        else {
          const sp = feed.proj?.players?.[id], st = sp || kickerStats(c?.imp, { spread: c?.spread ?? 0 });
          if (sp) r.withSleeperProjection++;
          mean = st ? points(st, s, "K") * availMult(availability(p.i, feed.injuries?.players?.[id]).status) : 0;
        }
        if (mean > 0) r.wouldShowOnPlayersTab++; else r.zeroProjection++;
      }
      out[pos] = r;
    }

    const verdict = [];
  try {
    const u = await computeUsage(), c = u.coverage;
    if (c) verdict.push(`Stat model: ${c.linked} of ${c.active} players with a game this season are linked to their game logs${c.byName ? ` (${c.byName} by name)` : ""}${c.missing.length ? `. Not linked: ${c.missing.slice(0, 6).map((m) => `${m.n} (${m.p})`).join(", ")}` : ""}.`);
  } catch (e) { verdict.push(`Stat model: game logs unavailable (${e.message}).`); }
    for (const pos of ["K", "DEF"]) {
      const r = out[pos];
      if (!r.inPlayerList) verdict.push(`Sleeper's player list has no ${label[pos]}, so that tab has nothing to show.`);
      else if (!r.wouldShowOnPlayersTab) verdict.push(`${r.inPlayerList} ${label[pos]} are in the player list but none has a projection: ${r.noGameThisWeek} have no game this week and ${r.noLinePosted} have a game with no line posted.`);
      else if (r.wouldShowOnPlayersTab < r.inPlayerList) verdict.push(`${r.wouldShowOnPlayersTab} of ${r.inPlayerList} ${label[pos]} would show on the Players tab; ${r.noGameThisWeek} have no game this week and ${r.noLinePosted} have no line yet.`);
      else verdict.push(`All ${r.inPlayerList} ${label[pos]} would show on the Players tab.`);
    }
    const st = feed.ecr?.stats || {}, un = feed.ecr?.unmapped || {};
    for (const [pos, name] of [["K", "kickers"], ["DST", "defenses"]]) {
      if (st[pos]) verdict.push(`Expert ranks: ${st[pos].mapped} of ${st[pos].rows} ${name} matched to a Sleeper player${un[pos]?.length ? ` (unmatched: ${un[pos].join(", ")})` : ""}.`);
      else verdict.push(`Expert ranks: the rankings file has no ${name} rows${feed.ecr?.status !== "ok" ? ` (rankings status: ${feed.ecr?.status})` : ""}.`);
    }

    return json({
      ok: true, season: feed.season, week: feed.week, generatedAt: new Date().toISOString(),
      playersInList: ids.length, gamesThisWeek: feed.games.length, gamesWithLines: feed.games.filter((g) => g.line).length,
      kickers: out.K, defenses: out.DEF, verdict,
      sources: feed.sources.map((x) => ({ key: x.key, status: x.status, note: x.note })), health: feed.health,
    });
  } catch (e) { return fail(`Diagnostics failed: ${e.message}`, 502); }
};
