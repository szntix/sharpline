import { json, fail, store, cached } from "./lib/util.mjs";
import { computeUsage } from "./lib/history.mjs";
import { project, quantile } from "../../public/js/model.js";

// Grades every frozen pre-kickoff row against what actually happened (PPR points, from nflverse), using the numbers saved at the time.
// Four sources are compared on exactly the same player-weeks; the app's own number for everyone is reported separately.
const SOURCES = ["blend", "model", "experts", "sleeper"];
const POS = ["QB", "RB", "WR", "TE"];

function stats(pairs) {
  const n = pairs.length; if (!n) return { n: 0 };
  let ae = 0, se = 0, bias = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (const [p, y] of pairs) { const e = p - y; ae += Math.abs(e); se += e * e; bias += e; sx += p; sy += y; sxx += p * p; syy += y * y; sxy += p * y; }
  const cov = sxy / n - (sx / n) * (sy / n), vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2;
  return { n, mae: +(ae / n).toFixed(2), rmse: +Math.sqrt(se / n).toFixed(2), bias: +(bias / n).toFixed(2), r: vx > 0 && vy > 0 ? +(cov / Math.sqrt(vx * vy)).toFixed(3) : null };
}

// The saved numbers for a row. Rows saved before outputs were frozen are re-scored with the current model, and counted so the record can say so.
const outOf = (row) => (row.out ? { kind: row.out.k, pre: row.out.pre, model: row.out.m ?? null, experts: row.out.e ?? null, sleeper: row.out.s ?? null, sd: row.out.sd, mult: row.out.mu ?? 1, saved: true } : { ...project(row), saved: false });

// Pure grading: usage has each player's actual points by week, docs the frozen rows by week. Nothing here reads the clock or the store.
export function gradeFrom(usage, docs) {
  const acc = { pairs: Object.fromEntries(SOURCES.map((s) => [s, Object.fromEntries(POS.map((p) => [p, []]))])), app: [], weeks: [], byWeek: [], inside: 0, total: 0, both: [], common: 0, avail: {}, noShows: 0, leads: [], rows: 0, recomputed: 0 };
  for (let w = 1; w <= usage.throughWeek; w++) {
    const doc = docs[w]; if (!doc) continue;
    const wk = { week: w, n: 0, err: Object.fromEntries(SOURCES.map((s) => [s, []])) };
    for (const [id, row] of Object.entries(doc.rows)) {
      if (!row.frozen && w >= usage.throughWeek) continue;               // games not all final yet
      const p = outOf(row); if (p.kind === "none") continue;
      acc.rows++; if (!p.saved) acc.recomputed++;
      const played = usage.players[id]?.log?.find((l) => l[0] === w);
      if (p.mult > 0) {                                                  // players the app expected to play: did they?
        const key = row.status === "Questionable" || row.status === "Doubtful" ? row.status : "Healthy", a = (acc.avail[key] ||= { n: 0, played: 0, counted: 0 });
        a.n++; a.counted += p.mult; if (played) a.played++; else acc.noShows++;
      }
      if (!played) continue;                                             // accuracy of the projection itself is graded on players who played
      const y = played[1], ko = Date.parse(row.game?.kickoff);
      if (isFinite(ko) && row.at) acc.leads.push((ko - row.at) / 3.6e6);
      acc.app.push([p.pre, y]);                                          // what the app showed, for everyone
      if (p.kind === "blend" && p.experts != null && p.sleeper != null && p.model != null) {   // the same player-weeks for every source
        const M = { blend: p.pre, model: p.model, experts: p.experts, sleeper: p.sleeper }; acc.common++;
        for (const s of SOURCES) { acc.pairs[s][row.pos].push([M[s], y]); wk.err[s].push(Math.abs(M[s] - y)); }
      }
      if (p.mult !== 0) { acc.total++; if (y >= quantile(p.pre, p.sd, 0.1) && y <= quantile(p.pre, p.sd, 0.9)) acc.inside++; }
      if (p.experts != null && p.sleeper != null) acc.both.push([p.experts, p.sleeper, y]);
      wk.n++;
    }
    if (wk.n) { acc.weeks.push(w); acc.byWeek.push({ week: w, n: wk.n, ...Object.fromEntries(SOURCES.map((s) => [s, wk.err[s].length ? +(wk.err[s].reduce((a, b) => a + b, 0) / wk.err[s].length).toFixed(2) : null])) }); }
  }
  let sleeperShare = null;                                                // once there is enough evidence, let the data set how much Sleeper counts
  if (acc.weeks.length >= 2 && acc.both.length >= 200) {
    let num = 0, den = 0; for (const [a, b, y] of acc.both) { num += (y - a) * (b - a); den += (b - a) ** 2; }
    if (den > 0) sleeperShare = Math.round(Math.min(0.7, Math.max(0, num / den)) * 20) / 20;
  }
  const bySource = {};
  for (const s of SOURCES) { bySource[s] = {}; let all = []; for (const p of POS) { bySource[s][p] = stats(acc.pairs[s][p]); all = all.concat(acc.pairs[s][p]); } bySource[s].ALL = stats(all); }
  bySource.app = { ALL: stats(acc.app) };
  const avail = Object.fromEntries(Object.entries(acc.avail).map(([k, a]) => [k, { n: a.n, played: +(a.played / a.n).toFixed(3), counted: +(a.counted / a.n).toFixed(3) }]));
  const leads = acc.leads.sort((a, b) => a - b), lead = leads.length ? { median: +leads[leads.length >> 1].toFixed(1), max: +leads.at(-1).toFixed(1) } : null;
  return { season: usage.season, weeks: acc.weeks, bySource, common: acc.common, byWeek: acc.byWeek, coverage80: acc.total ? +(acc.inside / acc.total).toFixed(3) : null, graded: acc.total, sleeperShare, avail, noShows: acc.noShows, rows: acc.rows, recomputed: acc.recomputed, lead, updated: Date.now() };
}

async function grade() {
  const usage = await computeUsage(), st = store("frozen"), docs = {};
  for (let w = 1; w <= usage.throughWeek; w++) docs[w] = await st.get(`${usage.season}-w${w}`, { type: "json" }).catch(() => null);
  return gradeFrom(usage, docs);
}

export default async () => {
  try { return json(await cached("accuracy-v2", 30 * 60e3, grade), 200, { "cache-control": "public, max-age=300", "netlify-cdn-cache-control": "public, durable, max-age=300, stale-while-revalidate=600" }); }
  catch (e) { return fail(`Couldn't grade yet: ${e.message}`, 502); }
};
