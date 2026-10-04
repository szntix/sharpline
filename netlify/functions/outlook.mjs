import { json, fail, nflState, cached } from "./lib/util.mjs";
import { schedule } from "./lib/schedule.mjs";

// Solves offense/defense ratings from every spread and total the market has posted
// (this season weighted by recency, plus a light prior from last season), then projects
// each team's implied points for every remaining game. This is the rest-of-season lens for trades.

function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-9;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / d; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-9));
}

async function ratings(season, currentWeek) {
  const cur = await schedule(season);
  const prev = await schedule(season - 1).catch(() => []);
  const teams = [...new Set(cur.flatMap((g) => [g.home, g.away]))].sort();
  const ix = Object.fromEntries(teams.map((t, i) => [t, i]));
  const N = 2 + 2 * teams.length, A = Array.from({ length: N }, () => new Array(N).fill(0)), b = new Array(N).fill(0);
  const add = (row, y, w) => { for (let i = 0; i < N; i++) if (row[i]) { b[i] += w * row[i] * y; for (let j = 0; j < N; j++) if (row[j]) A[i][j] += w * row[i] * row[j]; } };
  const obs = (g, w) => {
    if (g.spread == null || g.total == null || ix[g.home] == null || ix[g.away] == null) return;
    const ih = g.total / 2 + g.spread / 2, ia = g.total / 2 - g.spread / 2;
    const rh = new Array(N).fill(0); rh[0] = 1; rh[1] = 1; rh[2 + ix[g.home]] = 1; rh[2 + teams.length + ix[g.away]] = -1; add(rh, ih, w);
    const ra = new Array(N).fill(0); ra[0] = 1; ra[2 + ix[g.away]] = 1; ra[2 + teams.length + ix[g.home]] = -1; add(ra, ia, w);
  };
  for (const g of cur) if (g.week <= currentWeek + 1) obs(g, Math.pow(0.88, Math.max(0, currentWeek - g.week)));
  for (const g of prev) obs(g, 0.25 * Math.pow(0.9, Math.max(0, 18 - g.week)));
  for (let i = 2; i < N; i++) A[i][i] += 0.8; // ridge toward average
  const x = solve(A, b);
  const R = {};
  teams.forEach((t, i) => { R[t] = { off: +x[2 + i].toFixed(2), def: +x[2 + teams.length + i].toFixed(2) }; });
  return { mu: x[0], hfa: x[1], R, cur };
}

export default async (req) => {
  try {
    const state = await nflState();
    const season = Number(state.season), week = Number(state.week);
    const data = await cached(`outlook-${season}-${week}`, 6 * 3600e3, async () => {
      const { mu, hfa, R, cur } = await ratings(season, week);
      const imp = (t, o, home) => mu + (home ? hfa : 0) + R[t].off - R[o].def;
      const teams = {};
      for (const t of Object.keys(R)) teams[t] = { rating: R[t], games: [] };
      for (const g of cur) {
        if (g.week < week || g.hs != null) continue;
        const posted = g.spread != null && g.total != null;
        const ih = posted ? g.total / 2 + g.spread / 2 : imp(g.home, g.away, true);
        const ia = posted ? g.total / 2 - g.spread / 2 : imp(g.away, g.home, false);
        teams[g.home]?.games.push({ week: g.week, opp: g.away, home: true, imp: +ih.toFixed(1), oppImp: +ia.toFixed(1), posted });
        teams[g.away]?.games.push({ week: g.week, opp: g.home, home: false, imp: +ia.toFixed(1), oppImp: +ih.toFixed(1), posted });
      }
      const avg = mu + hfa / 2;
      for (const t of Object.values(teams)) t.games.sort((a, b) => a.week - b.week);
      return { season, week, leagueAvgImplied: +avg.toFixed(2), teams };
    });
    return json(data, 200, { "cache-control": "public, max-age=600", "netlify-cdn-cache-control": "public, durable, max-age=3600, stale-while-revalidate=21600" });   // shared by everyone and changes about weekly
  } catch (e) {
    return fail(`Outlook failed: ${e.message}`, 502);
  }
};
