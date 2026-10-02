import { json, fail, store, cached } from "./lib/util.mjs";
import { computeUsage } from "./lib/history.mjs";
import { project, quantile } from "../../public/js/model.js";

// Grades every frozen pre-kickoff row against what actually happened (PPR points, from nflverse).
// Four sources per player: our model, the experts, Sleeper, and the blend that the app shows.
const SOURCES = ["blend", "model", "experts", "sleeper"];
const POS = ["QB", "RB", "WR", "TE"];

function stats(pairs) {
  const n = pairs.length; if (!n) return { n: 0 };
  let ae = 0, se = 0, bias = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (const [p, y] of pairs) { const e = p - y; ae += Math.abs(e); se += e * e; bias += e; sx += p; sy += y; sxx += p * p; syy += y * y; sxy += p * y; }
  const cov = sxy / n - (sx / n) * (sy / n), vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2;
  return { n, mae: +(ae / n).toFixed(2), rmse: +Math.sqrt(se / n).toFixed(2), bias: +(bias / n).toFixed(2), r: vx > 0 && vy > 0 ? +(cov / Math.sqrt(vx * vy)).toFixed(3) : null };
}

async function grade() {
  const usage = await computeUsage(); const st = store("frozen");
  const acc = { season: usage.season, weeks: [], pairs: Object.fromEntries(SOURCES.map((s) => [s, Object.fromEntries(POS.map((p) => [p, []]))])), byWeek: [], inside: 0, total: 0, both: [] };
  for (let w = 1; w <= usage.throughWeek; w++) {
    const doc = await st.get(`${usage.season}-w${w}`, { type: "json" }).catch(() => null); if (!doc) continue;
    const wk = { week: w, n: 0, err: Object.fromEntries(SOURCES.map((s) => [s, []])) };
    for (const [id, row] of Object.entries(doc.rows)) {
      if (!row.frozen && w >= usage.throughWeek) continue;               // games not all final yet
      const played = usage.players[id]?.log?.find((l) => l[0] === w); if (!played) continue;   // did not play: nothing to grade
      const y = played[1], p = project(row), M = { blend: p.kind === "blend" ? p.pre : null, model: p.model, experts: p.experts, sleeper: p.sleeper };
      for (const s of SOURCES) if (M[s] != null) { acc.pairs[s][row.pos].push([M[s], y]); wk.err[s].push(Math.abs(M[s] - y)); }
      if (p.kind !== "none" && p.mult !== 0) { acc.total++; if (y >= quantile(p.pre, p.sd, 0.1) && y <= quantile(p.pre, p.sd, 0.9)) acc.inside++; }
      if (p.experts != null && p.sleeper != null) acc.both.push([p.experts, p.sleeper, y]);
      wk.n++;
    }
    if (wk.n) { acc.weeks.push(w); acc.byWeek.push({ week: w, n: wk.n, ...Object.fromEntries(SOURCES.map((s) => [s, wk.err[s].length ? +(wk.err[s].reduce((a, b) => a + b, 0) / wk.err[s].length).toFixed(2) : null])) }); }
  }
  // Once there is enough evidence, let the data set how much Sleeper's numbers count next to the experts'.
  let sleeperShare = null;
  if (acc.weeks.length >= 2 && acc.both.length >= 200) {
    let num = 0, den = 0; for (const [a, b, y] of acc.both) { num += (y - a) * (b - a); den += (b - a) ** 2; }
    if (den > 0) sleeperShare = Math.round(Math.min(0.7, Math.max(0, num / den)) * 20) / 20;
  }
  const bySource = {};
  for (const s of SOURCES) { bySource[s] = {}; let all = []; for (const p of POS) { bySource[s][p] = stats(acc.pairs[s][p]); all = all.concat(acc.pairs[s][p]); } bySource[s].ALL = stats(all); }
  return { season: acc.season, weeks: acc.weeks, bySource, byWeek: acc.byWeek, coverage80: acc.total ? +(acc.inside / acc.total).toFixed(3) : null, graded: acc.total, sleeperShare, updated: Date.now() };
}

export default async () => {
  try { return json(await cached("accuracy-v1", 30 * 60e3, grade), 200, { "cache-control": "public, max-age=300", "netlify-cdn-cache-control": "public, durable, max-age=300, stale-while-revalidate=600" }); }
  catch (e) { return fail(`Couldn't grade yet: ${e.message}`, 502); }
};
