import { MODEL } from "./coefs.js";

// ---------------------------------------------------------------------------------------------
// The projection model. Used in the browser for display and on the server for grading, so what
// you see is exactly what gets scored. Every constant comes from research/backtest.py.
// ---------------------------------------------------------------------------------------------
const SHIFT = 4;
export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export function invNorm(p) {
  if (p <= 0) return -8; if (p >= 1) return 8;
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  let q, r;
  if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p > 0.97575) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  q = p - 0.5; r = q * q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
export function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Fantasy scores are skewed, so ranges are shifted lognormal (validated: the 10th to 90th band holds 80%).
export function quantile(mean, sd, q) {
  if (!(mean > 0)) return 0;
  const m = mean + SHIFT, v = Math.log(1 + (sd * sd) / (m * m)), mu = Math.log(m) - v / 2;
  return Math.exp(mu + Math.sqrt(v) * invNorm(q)) - SHIFT;
}
export const dots = (mean, sd, n = 20) => Array.from({ length: n }, (_, i) => quantile(mean, sd, (i + 0.5) / n));

// ---------------------------------------------------------------------------------------------
// Game context from a posted line
// ---------------------------------------------------------------------------------------------
export function teamContext(g, team) {
  if (!g) return null;
  const isHome = g.home === team, opp = isHome ? g.away : g.home;
  const L = g.line;
  if (!L) return { home: +isHome, opp, imp: null, oppImp: null, spread: null, total: null };
  const fav = isHome ? L.spread : -L.spread;
  return { home: +isHome, opp, imp: L.total / 2 + fav / 2, oppImp: L.total / 2 - fav / 2, spread: fav, total: L.total };
}
export const gameMap = (feed) => { const m = {}; for (const g of feed?.games || []) { m[g.home] = g; m[g.away] = g; } return m; };

const HARD_OUT = ["Out", "IR", "PUP", "Sus", "NA", "COV"];
export function availability(sleeperStatus, official) {
  if (["IR", "PUP", "Sus", "NA", "COV"].includes(sleeperStatus)) return { status: sleeperStatus, practice: official?.p || null, injury: official?.i || null, official: false };
  if (official && (official.s || official.p)) return { status: official.s || null, practice: official.p || null, injury: official.i || null, official: !!official.s };
  return { status: sleeperStatus && sleeperStatus !== "Healthy" ? sleeperStatus : null, practice: null, injury: null, official: false };
}
// Tested on official designations from the final injury report: Doubtful players almost never played, and Questionable ones averaged about 80%.
// Against the app's earlier rule that is about 1% less projection error, roughly half a point a week. A status that only comes from Sleeper
// (before the official report exists) keeps the earlier rule, and within 90 minutes of kickoff a Questionable player who has not been ruled out
// is treated as playing, because inactives have been announced by then.
export function availMult(s, { official = true, minsToKick = null } = {}) {
  if (HARD_OUT.includes(s)) return 0;
  if (s === "Doubtful") return official ? 0 : 0.25;
  if (s === "Questionable") return !official || (minsToKick != null && minsToKick <= 90) ? 1 : 0.8;
  return 1;
}
const minsTo = (g) => (g?.kickoff ? (Date.parse(g.kickoff) - Date.now()) / 60000 : null);

// One row = everything the model knows about a player before kickoff.
export function makeRow(id, { players, usage, feed, games }) {
  const p = players[id]; if (!p) return null;
  const g = games[p.t], c = teamContext(g, p.t), u = usage?.players?.[id];
  const ecr = feed.ecr?.players?.[id] || null, sp = feed.proj?.players?.[id] || null;
  const wx = g?.forecast || null;
  const av = availability(p.i, feed.injuries?.players?.[id]);
  return {
    id, stOfficial: av.official, minsToKick: minsTo(g), pos: p.p, team: p.t, opp: c?.opp || null, bye: !!(feed.games?.length && p.t && !g), gameId: g?.id || null,
    home: c ? c.home : null, imp: c?.imp ?? null, oppImp: c?.oppImp ?? null, spread: c?.spread ?? null, total: c?.total ?? null,
    n: u?.n ?? 0, form: u?.form ?? null, tgt: u?.tgt ?? null, car: u?.car ?? null, ts: u?.ts ?? null,
    dvp: c && usage?.dvp?.[c.opp]?.[p.p] != null ? usage.dvp[c.opp][p.p] : null,
    impDev: c?.imp != null ? c.imp / MODEL.leagueImplied - 1 : null,
    wind15: wx ? +(wx.wind >= 15) : null, cold: wx ? +(wx.temp <= 35) : null,
    ecr: ecr ? { e: ecr.e, sd: ecr.sd, b: ecr.b, w: ecr.w, o: ecr.o, g: ecr.g } : null,
    sleeper: sp ? sp.ppr : null, status: av.status, practice: av.practice, injury: av.injury,
  };
}

const GROUP_OF = { imp_dev: "env", form_x_imp: "env", tgt: "usage", car: "usage", ts: "usage", dvp: "dvp", wind15: "wind", cold: "wind", home: "home", spread: "spread" };

// Our own estimate from recent form, opportunity, the Vegas total and (only where proven) matchup and weather.
export function modelPPR(row) {
  const M = MODEL.pos[row.pos];
  if (!M || row.n < 3 || row.form == null) return null;
  const v = { imp_dev: row.impDev, form_x_imp: row.impDev == null ? null : row.form * row.impDev, tgt: row.tgt, car: row.car, ts: row.ts, dvp: row.dvp, wind15: row.wind15, cold: row.cold, home: row.home };
  let y = M.coef.intercept + M.coef.form * row.form, base = y;
  const parts = { env: 0, usage: 0, dvp: 0, wind: 0, home: 0 };
  for (const f of M.features) {
    if (f === "form") continue;
    const mean = M.means[f], x = v[f] == null ? mean : v[f]; // unknown inputs fall back to typical, adding nothing
    y += M.coef[f] * x; base += M.coef[f] * mean; parts[GROUP_OF[f]] = (parts[GROUP_OF[f]] || 0) + M.coef[f] * (x - mean);
  }
  return { ppr: Math.max(0.5, y), raw: y, base, parts };
}

export function ecrPoints(pos, e) {
  const t = MODEL.rankToPoints?.[pos]; if (!t || e == null) return null;
  if (e <= 1) return t[0];
  const i = Math.floor(e) - 1; if (i >= t.length - 1) return t[t.length - 1] * Math.max(0.4, 1 - 0.012 * (e - t.length));
  return t[i] + (e - Math.floor(e)) * (t[i + 1] - t[i]);
}

// Experts first (FantasyPros), Sleeper's numbers as a second opinion. Sleeper's share is a prior until enough live weeks are graded.
export const SLEEPER_SHARE = 0.35;
function consensus(row, share = SLEEPER_SHARE) {
  const a = row.ecr ? ecrPoints(row.pos, row.ecr.e) : null, b = row.sleeper;
  if (a != null && b != null) return { pts: (1 - share) * a + share * b, ecr: a, sleeper: b };
  if (a != null) return { pts: a, ecr: a, sleeper: null };
  if (b != null) return { pts: b, ecr: null, sleeper: b };
  return null;
}

export function project(row, { sleeperShare } = {}) {
  const M = MODEL.pos[row.pos];
  const m = modelPPR(row), c = consensus(row, sleeperShare ?? SLEEPER_SHARE);
  let mean, kind, wM = 0, wE = 0;
  if (m && c && M) { wM = M.wModel; wE = M.wExperts; mean = wM * m.ppr + wE * c.pts; kind = "blend"; }
  else if (c) { mean = c.pts; kind = c.ecr != null ? "experts" : "sleeper"; wE = 1; }
  else if (m) { mean = m.ppr; kind = "model"; wM = 1; }
  else return { kind: "none", mean: 0, sd: 1, pre: 0, model: null, experts: null, sleeper: null, parts: null, weights: { model: 0, experts: 0 } };
  const pre = mean;
  const mult = row.bye ? 0 : availMult(row.status, { official: row.stOfficial, minsToKick: row.minsToKick });
  mean *= mult;
  const ab = (kind === "blend" || kind === "experts") && M?.sdBlend ? M.sdBlend : M?.sdModel || [3, 0.3, 1];
  const sd = Math.max(1, (ab[0] + ab[1] * Math.max(pre, 0.5)) * ab[2]);
  return { kind, mean, pre, sd, model: m?.ppr ?? null, base: m?.base ?? null, parts: m?.parts ?? null, experts: c?.ecr ?? null, sleeper: c?.sleeper ?? row.sleeper ?? null,
    consensus: c?.pts ?? null, weights: { model: wM, experts: wE }, mult };
}

// ---------------------------------------------------------------------------------------------
// Head-to-head: chance A outscores B, calibrated on 2021-2026 pairs
// ---------------------------------------------------------------------------------------------
export function duel(a, b, rho = 0) {
  const ka = MODEL.pos[a.pos]?.k ?? 1.9, kb = MODEL.pos[b.pos]?.k ?? 1.9, k = (ka + kb) / 2;
  const v = a.sd ** 2 + b.sd ** 2 - 2 * rho * a.sd * b.sd;
  return sigmoid((k * (a.mean - b.mean)) / Math.sqrt(Math.max(v, 1)));
}
export function duelRecord(pos, gap) {
  const t = MODEL.proof.duel?.[pos]; if (!t) return null;
  const g = Math.abs(gap); return t.find((r) => g >= r.gap[0] && g < r.gap[1]) || null;
}

// Points this usage is normally worth, before touchdown luck and big plays
export function xppr(pos, tgt, car) { const c = MODEL.xppr[pos]; return c && tgt != null ? c[0] + c[1] * tgt + c[2] * (car || 0) : null; }

// ---------------------------------------------------------------------------------------------
// Kickers and defenses have no player model. They are estimated from the game line, and labeled as estimates.
// ---------------------------------------------------------------------------------------------
export function defenseStats(implied, oppImplied, spread) {
  if (implied == null || oppImplied == null) return null;
  const sd = 9.6, mu = oppImplied;
  const tiers = [["pts_allow_0", -Infinity, 0.5], ["pts_allow_1_6", 0.5, 6.5], ["pts_allow_7_13", 6.5, 13.5], ["pts_allow_14_20", 13.5, 20.5], ["pts_allow_21_27", 20.5, 27.5], ["pts_allow_28_34", 27.5, 34.5], ["pts_allow_35p", 34.5, Infinity]];
  const st = {}; for (const [k, lo, hi] of tiers) st[k] = normCdf((hi - mu) / sd) - normCdf((lo - mu) / sd);
  const pressure = 1 + 0.025 * spread - 0.015 * (oppImplied - 22);
  Object.assign(st, { sack: 2.45 * pressure, int: 0.78 * pressure, fum_rec: 0.55 * pressure, def_td: 0.16 * pressure, safe: 0.03, blk_kick: 0.06, def_st_td: 0.05 });
  return st;
}
export function kickerStats(implied) {
  if (implied == null) return null;
  const fgm = implied * 0.068, xpm = implied * 0.087 * 0.94;
  return { fgm_0_19: fgm * 0.02, fgm_20_29: fgm * 0.25, fgm_30_39: fgm * 0.28, fgm_40_49: fgm * 0.27, fgm_50p: fgm * 0.18, xpm, fgmiss: 0.26, xpmiss: 0.05 };
}

export { minsTo };
