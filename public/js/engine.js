import { points, PPR, SLOT_ELIG } from "./scoring.js";
import { STUDY, pairCorr } from "./research.js";
import { makeRow, project, gameMap, teamContext, defenseStats, kickerStats, availability, availMult, minsTo, invNorm, xppr } from "./model.js";
export { invNorm };

// ---------------------------------------------------------------------------
// Distributions: each projection is a shifted lognormal (scores are right-skewed and can dip below zero).
// The spread of each player's range comes from the backtest and is calibrated so 80% of results land inside.
// ---------------------------------------------------------------------------
const SHIFT = 4;
function lnParams(mean, sd) {
  const m = mean + SHIFT, v = Math.log(1 + (sd * sd) / (m * m));
  return { mu: Math.log(m) - v / 2, s: Math.sqrt(v) };
}
export function quantile(pr, q) {
  if (!pr || pr.mean <= 0) return 0;
  const { mu, s } = lnParams(pr.mean, pr.sd);
  return Math.exp(mu + s * invNorm(q)) - SHIFT;
}
const draw = (pr, z) => {
  if (!pr || pr.mean <= 0) return 0;
  const { mu, s } = pr._ln || (pr._ln = lnParams(pr.mean, pr.sd));
  return Math.exp(mu + s * z) - SHIFT;
};

// Rough stat mix by position. Only used to translate PPR into an odd scoring system when Sleeper has no line for a player.
const MIX = {
  QB: (p) => ({ pass_yd: p * 11, pass_td: p * 0.085, pass_int: 0.6, rush_yd: p * 1.1, rush_td: 0.2, fum_lost: 0.1 }),
  RB: (p) => ({ rush_yd: p * 4.2, rush_td: p * 0.035, rec: p * 0.13, rec_yd: p * 1.0, rec_td: 0.05, fum_lost: 0.05 }),
  WR: (p) => ({ rec: p * 0.34, rec_yd: p * 4.6, rec_td: p * 0.03, fum_lost: 0.03 }),
  TE: (p) => ({ rec: p * 0.33, rec_yd: p * 3.6, rec_td: p * 0.035, fum_lost: 0.02 }),
};
function lscaleFor(pos, sleeperStats, ppr, s) {
  const st = sleeperStats && points(sleeperStats, PPR, pos) > 2 ? sleeperStats : MIX[pos]?.(Math.max(ppr, 1));
  if (!st) return 1;
  const a = points(st, PPR, pos), b = points(st, s, pos);
  return a > 1 && isFinite(b / a) ? Math.max(0.4, Math.min(2.2, b / a)) : 1;
}

// ---------------------------------------------------------------------------
// Weekly projections in the league's own scoring. Players get the blended model (see model.js);
// kickers and defenses are estimated from the game line and labeled that way.
// ---------------------------------------------------------------------------
export function buildProjections(ctx, league) {
  const { players, feed, usage, acc } = ctx; const s = league.scoring; const out = {};
  const games = gameMap(feed), oppOf = {};
  for (const g of feed?.games || []) { oppOf[g.home] = g.away; oppOf[g.away] = g.home; }
  const haveSchedule = (feed?.games || []).length > 0;
  for (const [id, p] of Object.entries(players)) {
    const team = p.t, g = games[team] || null, c = teamContext(g, team);
    const bye = haveSchedule && !!team && !g;
    const base = { id, team, opp: oppOf[team] || null, game: g, implied: c?.imp ?? null, oppImplied: c?.oppImp ?? null, spread: c?.spread ?? null, total: c?.total ?? null, wx: g?.forecast || null, bye };
    if (p.p === "DEF") {
      const st = defenseStats(c?.imp, c?.oppImp, c?.spread ?? 0);
      const mean = st && !bye ? points(st, s, "DEF") : 0, [a, b] = STUDY.volatility.DEF;
      out[id] = { ...base, mean: +mean.toFixed(2), ppr: mean, lscale: 1, sd: Math.max(1, a + b * mean), kind: st ? "lines" : "none", src: bye ? "bye" : st ? "lines" : "none", status: null, cons: null, experts: null, model: null, sleeper: null, parts: null, ecr: feed?.ecr?.players?.[id] || null };
      continue;
    }
    if (p.p === "K") {
      const av = availability(p.i, feed?.injuries?.players?.[id]);
      const sp = feed?.proj?.players?.[id], st = sp || kickerStats(c?.imp);
      const mult = bye ? 0 : availMult(av.status, { official: av.official, minsToKick: minsTo(g) });
      const mean = st ? points(st, s, "K") * mult : 0, [a, b] = STUDY.volatility.K;
      out[id] = { ...base, mean: +mean.toFixed(2), ppr: mean, lscale: 1, sd: Math.max(1, a + b * mean), kind: sp ? "sleeper" : st ? "lines" : "none", src: bye ? "bye" : sp ? "sleeper" : st ? "lines" : "none", status: av.status, practice: av.practice, injury: av.injury, cons: null, experts: null, model: null, sleeper: sp?.ppr ?? null, parts: null, ecr: feed?.ecr?.players?.[id] || null };
      continue;
    }
    if (!["QB", "RB", "WR", "TE"].includes(p.p)) continue;
    const row = makeRow(id, { players, usage, feed, games });
    const r = project(row, { sleeperShare: acc?.sleeperShare ?? undefined });
    const st = feed?.proj?.players?.[id] || null;
    const ls = r.kind === "none" ? 1 : lscaleFor(p.p, st, r.pre, s);
    out[id] = { ...base, mean: +(r.mean * ls).toFixed(2), ppr: r.pre, lscale: ls, sd: r.sd * ls, kind: r.kind, src: bye ? "bye" : r.kind, status: row.status, practice: row.practice, injury: row.injury,
      model: r.model, base: r.base, parts: r.parts, experts: r.experts, sleeper: r.sleeper, weights: r.weights, cons: r.consensus != null ? r.consensus * ls : null, consensus: r.consensus, row, ecr: row.ecr };
  }
  return { proj: out, oppOf };
}

// ---------------------------------------------------------------------------
// Lineup optimizer. Fixed slots fill first, then flex slots from most to least restrictive.
// ---------------------------------------------------------------------------
const SLOT_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF", "REC_FLEX", "WRRB_FLEX", "FLEX", "SUPER_FLEX"];
export function optimal(roster, slots, valueOf, posOf) {
  const used = new Set(), starters = [];
  const ordered = slots.map((sl, i) => ({ sl, i })).filter((x) => SLOT_ELIG[x.sl]).sort((a, b) => SLOT_ORDER.indexOf(a.sl) - SLOT_ORDER.indexOf(b.sl));
  for (const { sl, i } of ordered) {
    let best = null, bv = -Infinity;
    for (const id of roster) {
      if (used.has(id) || !SLOT_ELIG[sl].includes(posOf(id))) continue;
      const v = valueOf(id); if (v > bv) { bv = v; best = id; }
    }
    if (best) used.add(best);
    starters.push({ slot: sl, i, id: best, v: best ? bv : 0 });
  }
  starters.sort((a, b) => a.i - b.i);
  return { starters, bench: roster.filter((id) => !used.has(id)), total: starters.reduce((t, x) => t + (x.v || 0), 0) };
}

// ---------------------------------------------------------------------------
// Correlated Monte Carlo for a head-to-head matchup.
// ---------------------------------------------------------------------------
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function cholesky(C) {
  const n = C.length;
  for (let shrink = 1; shrink > 0.2; shrink *= 0.85) {
    const L = Array.from({ length: n }, () => new Float64Array(n)); let ok = true;
    for (let i = 0; i < n && ok; i++) for (let j = 0; j <= i; j++) {
      let sum = (i === j ? 1 : C[i][j] * shrink);
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) { if (sum <= 1e-9) { ok = false; break; } L[i][i] = Math.sqrt(sum); } else L[i][j] = sum / L[j][j];
    }
    if (ok) return L;
  }
  return Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
}

export function sampleScores(ids, proj, posOf, oppOf, N = 5000, seed = 7) {
  const n = ids.length;
  const C = ids.map((a) => ids.map((b) => (a === b ? 1 : pairCorr(posOf(a), proj[a]?.team, posOf(b), proj[b]?.team, oppOf))));
  const L = cholesky(C), rand = rng(seed);
  const S = ids.map(() => new Float32Array(N));
  const e = new Float64Array(n);
  for (let k = 0; k < N; k++) {
    for (let i = 0; i < n; i += 2) {
      const u1 = Math.max(rand(), 1e-12), u2 = rand(), r = Math.sqrt(-2 * Math.log(u1));
      e[i] = r * Math.cos(2 * Math.PI * u2); if (i + 1 < n) e[i + 1] = r * Math.sin(2 * Math.PI * u2);
    }
    for (let i = 0; i < n; i++) { let z = 0; const Li = L[i]; for (let j = 0; j <= i; j++) z += Li[j] * e[j]; S[i][k] = draw(proj[ids[i]], z); }
  }
  return Object.fromEntries(ids.map((id, i) => [id, S[i]]));
}

function lineupSamples(starterIds, S, N) {
  const out = new Float32Array(N);
  for (const id of starterIds) if (id && S[id]) { const a = S[id]; for (let k = 0; k < N; k++) out[k] += a[k]; }
  return out;
}
const pct = (arr, q) => { const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

export function matchup(ctx, league, P, myRoster, oppRoster) {
  const { proj, oppOf } = P; const posOf = (id) => ctx.players[id]?.p;
  const val = (id) => proj[id]?.mean ?? 0;
  const best = optimal(myRoster, league.slots, val, posOf);
  if (!oppRoster?.length) return { best, alt: null, win: null };
  const opp = optimal(oppRoster, league.slots, val, posOf);
  const oppIds = opp.starters.map((x) => x.id).filter(Boolean);
  const ids = [...new Set([...myRoster, ...oppIds])].filter((id) => proj[id]);
  const N = 5000, S = sampleScores(ids, proj, posOf, oppOf, N);
  const oppS = lineupSamples(oppIds, S, N);
  const winOf = (starterIds) => { const me = lineupSamples(starterIds, S, N); let w = 0; for (let k = 0; k < N; k++) w += me[k] > oppS[k] ? 1 : me[k] === oppS[k] ? 0.5 : 0; return { p: w / N, me }; };
  const baseIds = best.starters.map((x) => x.id);
  const base = winOf(baseIds);
  let top = { p: base.p, ids: baseIds, swap: null };
  for (const st of best.starters) for (const b of best.bench) {
    if (!st.id || !SLOT_ELIG[st.slot].includes(posOf(b)) || val(b) <= 0) continue;
    const ids2 = baseIds.map((x) => (x === st.id ? b : x));
    const r = winOf(ids2);
    if (r.p > top.p + 0.004) top = { p: r.p, ids: ids2, swap: { out: st.id, in: b, slot: st.slot, gain: r.p - base.p, ptsCost: val(st.id) - val(b) } };
  }
  return {
    best, opp, win: base.p, alt: top.swap ? top : null,
    me: { p10: pct(base.me, 0.1), p50: pct(base.me, 0.5), p90: pct(base.me, 0.9) },
    them: { p10: pct(oppS, 0.1), p50: pct(oppS, 0.5), p90: pct(oppS, 0.9) },
  };
}

// Best ball: your score is the best possible lineup each week, so volatility has extra value.
export function bestBallExpectation(ctx, league, P, roster) {
  const posOf = (id) => ctx.players[id]?.p, ids = roster.filter((id) => P.proj[id]);
  const N = 2000, S = sampleScores(ids, P.proj, posOf, P.oppOf, N, 11);
  let tot = 0;
  for (let k = 0; k < N; k++) tot += optimal(ids, league.slots, (id) => S[id][k], posOf).total;
  return tot / N;
}

// ---------------------------------------------------------------------------
// Rest-of-season value. Weekly baseline blends this week's market view with season production,
// then each remaining game is scaled by its market-implied team total (elasticities from the study).
// ---------------------------------------------------------------------------
const ELAST = { QB: 1.1, WR: 1.1, RB: 0.5, TE: 0.7, K: 0.1 };
const AGE = {
  RB: [[22, 0.95], [24, 1], [25, 0.97], [26, 0.92], [27, 0.85], [28, 0.75], [29, 0.62], [30, 0.5]],
  WR: [[22, 0.88], [23, 0.95], [27, 1], [28, 0.97], [29, 0.92], [30, 0.85], [31, 0.76], [32, 0.66], [33, 0.55]],
  TE: [[23, 0.8], [24, 0.9], [25, 0.96], [29, 1], [30, 0.92], [31, 0.83], [32, 0.7]],
  QB: [[23, 0.9], [24, 0.95], [33, 1], [34, 0.93], [35, 0.85], [36, 0.75], [37, 0.65]],
};
export function ageFactor(pos, age) {
  const c = AGE[pos]; if (!c || age == null) return 1;
  for (const [a, f] of c) if (age <= a) return f;
  // Past the last listed age the decline keeps going at the pace of the final step. It used to stop there, which treated a 34-year-old
  // running back as never aging again and gave him more future value than a 28-year-old.
  const [a1, f1] = c[c.length - 1], f0 = c[c.length - 2][1];
  return Math.max(0.05, f1 * Math.pow(f1 / f0, age - a1));
}

export function rosValues(ctx, league, P) {
  const { players, usage, outlook, feed } = ctx; const { proj } = P;
  const week = feed?.week || outlook?.week || 1, end = league.endWeek || 17, playoffStart = league.playoffStart || 15;
  const avg = outlook?.leagueAvgImplied || 22.5;
  const out = {};
  for (const [id, p] of Object.entries(players)) {
    const pr = proj[id]; if (!pr) continue;
    const u = usage?.players?.[id];
    const ratio = pr.lscale ?? 1;
    const healthy = pr.mean > 0 ? pr.mean : pr.cons || 0;
    const season = u && u.n >= 3 ? u.form * ratio : null;
    let base = season != null ? (healthy > 0 ? 0.55 * healthy + 0.45 * season : season * 0.9) : healthy;
    if (!base) continue;
    const games = outlook?.teams?.[p.t]?.games || [];
    const irWeeks = ["IR", "PUP", "Sus", "NA"].includes(p.i) ? 4 : ["Out"].includes(p.i) ? 1 : 0;
    let ros = 0, n = 0; const weekly = [];
    for (const g of games) {
      if (g.week < week || g.week > end) continue;
      let v;
      if (g.week === week) v = pr.mean;
      else {
        const f = p.p === "DEF" ? 1 - 0.95 * (g.oppImp / avg - 1) : 1 + (ELAST[p.p] ?? 0.6) * (g.imp / avg - 1);
        v = base * Math.max(0.5, Math.min(1.6, f));
        if (g.week - week < irWeeks) v = 0;
      }
      const wgt = league.playoffWeight && g.week >= playoffStart ? 1.5 : 1;
      ros += v * wgt; n += wgt; weekly.push([g.week, +v.toFixed(1), g.opp]);
    }
    if (!games.length) { const left = Math.max(0, end - week + 1); ros = base * left; n = left; }
    let future = 0;
    if (league.type === "dynasty" || league.type === "keeper") {
      const years = league.type === "dynasty" ? 3 : 1;
      for (let y = 1; y <= years; y++) future += base * 17 * (ageFactor(p.p, (p.a || 26) + y) / ageFactor(p.p, p.a || 26)) * Math.pow(0.8, y);
    }
    out[id] = { base: +base.toFixed(2), ros: +ros.toFixed(1), per: n ? ros / n : 0, games: n, future: +future.toFixed(1), weekly };
  }
  return out;
}

// Replacement level per position: the best player left after every team fills its starting lineup.
export function replacement(ctx, league, R) {
  const posOf = (id) => ctx.players[id]?.p;
  const byPos = {};
  for (const [id, v] of Object.entries(R)) (byPos[posOf(id)] ||= []).push([id, v.per]);
  for (const k in byPos) byPos[k].sort((a, b) => b[1] - a[1]);
  const T = league.teams || 12, counts = {};
  for (const sl of league.slots) if (["QB", "RB", "WR", "TE", "K", "DEF"].includes(sl)) counts[sl] = (counts[sl] || 0) + T;
  const taken = {}; for (const k in counts) taken[k] = counts[k];
  const flex = league.slots.filter((s) => SLOT_ELIG[s] && SLOT_ELIG[s].length > 1).sort((a, b) => SLOT_ELIG[a].length - SLOT_ELIG[b].length);
  for (const fs of flex) for (let t = 0; t < T; t++) {
    let bp = null, bv = -1;
    for (const pos of SLOT_ELIG[fs]) { const nxt = byPos[pos]?.[taken[pos] || 0]; if (nxt && nxt[1] > bv) { bv = nxt[1]; bp = pos; } }
    if (bp) taken[bp] = (taken[bp] || 0) + 1;
  }
  const repl = {};
  for (const pos of Object.keys(byPos)) repl[pos] = byPos[pos][taken[pos] || 0]?.[1] ?? 0;
  return repl;
}

export function tradeValue(id, ctx, league, R, repl) {
  const v = R[id]; if (!v) return 0;
  const pos = ctx.players[id]?.p, rp = repl[pos] || 0;
  const rosVor = Math.max(0, v.per - rp) * v.games;
  const futVor = v.future ? Math.max(0, v.future - rp * 17 * (league.type === "dynasty" ? 2.0 : 0.8)) : 0;
  return rosVor + (league.type === "dynasty" ? futVor : league.type === "keeper" ? 0.35 * futVor : 0);
}

function lineupStrength(roster, league, ctx, R) {
  return optimal(roster, league.slots, (id) => R[id]?.per || 0, (id) => ctx.players[id]?.p).total;
}

export function evaluateTrade(ctx, league, R, repl, myRoster, give, get, theirRoster = null) {
  const val = (ids) => ids.reduce((t, id) => t + tradeValue(id, ctx, league, R, repl), 0);
  const weeks = Math.max(1, Math.max(...Object.values(R).map((v) => v.games), 1));
  const before = lineupStrength(myRoster, league, ctx, R);
  const after = lineupStrength([...myRoster.filter((x) => !give.includes(x)), ...get], league, ctx, R);
  let theirs = null;
  if (theirRoster) {
    const tb = lineupStrength(theirRoster, league, ctx, R);
    const ta = lineupStrength([...theirRoster.filter((x) => !get.includes(x)), ...give], league, ctx, R);
    theirs = (ta - tb) * weeks;
  }
  return { giveValue: val(give), getValue: val(get), lineupGain: (after - before) * weeks, theirLineupGain: theirs, weeks };
}

// Every one-for-one swap is sorted into kept or dropped, so an empty list can say why. The kept list is exactly what it always was:
// a swap must improve your lineup by more than 1 point over the season and theirs by more than 0.5, at similar value, across two positions.
// Swaps that help you but not them are returned separately as "near", for an offer you might still pitch.
// Value is measured against the best player actually on waivers in this league when its rosters are known, so bench depth that beats
// the waiver wire is worth something. It never rises above the starting-lineup estimate, so a league with only some teams entered is unchanged.
export function waiverLevel(ctx, league, R, fallback) {
  if (!league.others?.length) return fallback;
  const taken = new Set([...league.roster, ...(league.taken || []), ...league.others.flatMap((o) => o.roster || [])]), best = {};
  for (const [id, v] of Object.entries(R)) { const p = ctx.players[id]; if (taken.has(id) || !p?.t) continue; if (v.per > (best[p.p] ?? -1)) best[p.p] = v.per; }
  const out = { ...fallback }; for (const pos in best) out[pos] = Math.min(fallback[pos] ?? best[pos], best[pos]);
  return out;
}

// Suggestions for the player in the calculator: every one-for-one swap involving him, best for your lineup first.
export function focusedTrades(ctx, league, R, repl, side, ids, others) {
  const rows = [], mine = league.roster.filter((id) => R[id]);
  for (const x of ids) {
    if (side === "get") { const team = others.find((o) => o.roster.includes(x)); if (!team) continue;
      for (const a of mine) rows.push({ team: team.name, teamId: team.id, give: [a], get: [x], ...evaluateTrade(ctx, league, R, repl, league.roster, [a], [x], team.roster) }); }
    else for (const team of others) for (const b of team.roster) if (R[b]) rows.push({ team: team.name, teamId: team.id, give: [x], get: [b], ...evaluateTrade(ctx, league, R, repl, league.roster, [x], [b], team.roster) });
  }
  return rows.map((r) => ({ ...r, score: r.lineupGain + 0.5 * Math.max(0, r.theirLineupGain) })).sort((a, b) => b.score - a.score).slice(0, 6);
}

export function tradeReport(ctx, league, R, repl, myRoster, others) {
  const all = [], near = [], stats = { teams: 0, pairs: 0, samePos: 0, noGainYou: 0, noGainThem: 0, lopsided: 0 };
  const posOf = (id) => ctx.players[id]?.p;
  const mine = myRoster.filter((id) => R[id] && tradeValue(id, ctx, league, R, repl) > 0);
  for (const team of others || []) {
    const theirs = (team.roster || []).filter((id) => R[id] && tradeValue(id, ctx, league, R, repl) > 0); stats.teams++;
    for (const a of mine) for (const b of theirs) {
      stats.pairs++;
      if (posOf(a) === posOf(b)) { stats.samePos++; continue; } // same-position swaps rarely fix needs
      const ev = evaluateTrade(ctx, league, R, repl, myRoster, [a], [b], team.roster);
      const fair = ev.giveValue / Math.max(1, ev.getValue), fairOk = fair > 0.7 && fair < 1.45;
      if (!(ev.lineupGain > 1)) { stats.noGainYou++; continue; }
      if (!(ev.theirLineupGain > 0.5)) { stats.noGainThem++; if (fairOk) near.push({ team: team.name, give: [a], get: [b], ...ev, score: ev.lineupGain }); continue; }
      if (!fairOk) { stats.lopsided++; continue; }
      all.push({ team: team.name, give: [a], get: [b], ...ev, score: ev.lineupGain + 0.5 * ev.theirLineupGain });
    }
  }
  all.sort((x, y) => y.score - x.score); near.sort((x, y) => y.lineupGain - x.lineupGain);
  return { ideas: all.slice(0, 12), near: near.slice(0, 5), stats: { ...stats, mine: mine.length, kept: all.length } };
}
export const tradeIdeas = (...args) => tradeReport(...args).ideas;

// ---------------------------------------------------------------------------
// Waiver board
// ---------------------------------------------------------------------------
export function waivers(ctx, league, P, R, myRoster, unavailable) {
  const posOf = (id) => ctx.players[id]?.p;
  const usable = new Set(league.slots.flatMap((s) => SLOT_ELIG[s] || []));
  const baseWeek = optimal(myRoster, league.slots, (id) => P.proj[id]?.mean || 0, posOf).total;
  const baseRos = lineupStrength(myRoster, league, ctx, R);
  const weeks = Math.max(1, ...Object.values(R).map((v) => v.games));
  const pool = Object.keys(R).filter((id) => !unavailable.has(id) && usable.has(posOf(id))).sort((a, b) => R[b].per - R[a].per).slice(0, 250);
  const rows = [];
  for (const id of pool) {
    const withMe = [...myRoster, id];
    const wk = optimal(withMe, league.slots, (x) => P.proj[x]?.mean || 0, posOf).total - baseWeek;
    const ros = (lineupStrength(withMe, league, ctx, R) - baseRos) * weeks;
    rows.push({ id, weekGain: wk, rosGain: ros, per: R[id].per, proj: P.proj[id]?.mean || 0 });
  }
  // Suggested drop: the rostered player whose absence costs the least rest-of-season.
  let drop = null, dropCost = Infinity;
  const repl = replacement(ctx, league, R);
  for (const id of myRoster) {
    const cost = baseRos - lineupStrength(myRoster.filter((x) => x !== id), league, ctx, R);
    const v = cost * weeks + 0.3 * tradeValue(id, ctx, league, R, repl);
    if (v < dropCost) { dropCost = v; drop = id; }
  }
  return { rows, drop };
}

// ---------------------------------------------------------------------------
// Signals: short, plain-English reasons attached to a player. Only things the backtest supports.
// ---------------------------------------------------------------------------
const pctf = (x) => `${Math.round(x * 100)}%`;
const avg = (a) => a.reduce((t, x) => t + x, 0) / Math.max(1, a.length);
export function statusText(pr) {
  const inj = pr.injury ? pr.injury.toLowerCase().replace(/^not injury related\s*-\s*/, "") : "";
  const prac = { DNP: "did not practice", Limited: "limited in practice", Full: "full practice" }[pr.practice] || "";
  if (!pr.status) return [prac ? prac[0].toUpperCase() + prac.slice(1) : "Practice report", inj && `(${inj})`].filter(Boolean).join(" ");
  return `${pr.status}${inj ? ` (${inj})` : ""}${prac ? `, ${prac}` : ""}`;
}
const leadCache = new WeakMap();
function teamLeaders(ctx) {
  if (leadCache.has(ctx.usage || leadCache)) return leadCache.get(ctx.usage);
  const best = {};
  for (const [id, u] of Object.entries(ctx.usage?.players || {})) {
    const t = ctx.players[id]?.t; if (!t || u.n < 3 || u.p === "QB") continue;
    if (!best[t] || u.tgt > best[t].tgt) best[t] = { id, tgt: u.tgt };
  }
  if (ctx.usage) leadCache.set(ctx.usage, best);
  return best;
}
export function signals(id, ctx, P) {
  const p = ctx.players[id], pr = P.proj[id], u = ctx.usage?.players?.[id], out = [];
  if (!p || !pr) return out;
  if (pr.bye) out.push({ t: "warn", s: "On bye this week", k: null });
  if (pr.status || pr.practice === "DNP") out.push({ t: availMult(pr.status) === 0 ? "down" : "warn", s: statusText(pr), k: null });
  if (pr.experts != null && pr.model != null && pr.mean > 0) {
    const d = pr.model - pr.experts;
    if (Math.abs(d) >= 2.5) out.push({ t: d > 0 ? "up" : "down", s: `Our stat model is ${Math.abs(d).toFixed(1)} points ${d > 0 ? "above" : "below"} the experts`, k: `Model ${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}` });
  }
  if (u && u.log?.length >= 4 && p.p !== "QB") {
    const key = p.p === "RB" ? 3 : 2, name = p.p === "RB" ? "Carries" : "Targets";
    const last = avg(u.log.slice(-2).map((l) => l[key])), before = avg(u.log.slice(0, -2).map((l) => l[key]));
    if (last - before >= (p.p === "RB" ? 3.5 : 2.5) && last >= (p.p === "RB" ? 10 : 5)) out.push({ t: "up", s: `${name} rising: ${last.toFixed(1)} a game the last two weeks, ${before.toFixed(1)} before`, k: `${name} up` });
    if (before - last >= (p.p === "RB" ? 4 : 3)) out.push({ t: "down", s: `${name} falling: ${last.toFixed(1)} a game the last two weeks, ${before.toFixed(1)} before`, k: `${name} down` });
  }
  if (u && u.g >= 3 && ["RB", "WR", "TE"].includes(p.p)) {
    const x = xppr(p.p, u.tgt, u.car), gap = x != null ? u.form - x : 0;
    if (gap >= 3) out.push({ t: "down", s: `Scoring ${gap.toFixed(1)} a game more than his workload usually earns. That tends to fade.`, k: "Running hot" });
    if (gap <= -3) out.push({ t: "up", s: `Scoring ${(-gap).toFixed(1)} a game less than his workload usually earns. That tends to correct.`, k: "Running cold" });
  }
  const lead = teamLeaders(ctx)[p.t];
  if (lead && lead.id !== id && ["WR", "RB"].includes(p.p)) {
    const L = ctx.players[lead.id], sts = pr.game ? (ctx.feed?.injuries?.players?.[lead.id]?.s || L?.i) : null;
    if (L && ["Out", "IR", "Doubtful", "PUP", "Sus"].includes(sts)) {
      const r = STUDY.targetLeaderOut[p.p];
      out.push({ t: "up", s: `${L.n}, the team's target leader, is ${String(sts).toLowerCase()}. ${p.p === "WR" ? "Receivers" : "Running backs"} have seen about ${r.lift}% more target share in that spot (${r.n} past cases).`, k: "Target boost" });
    }
  }
  if (pr.total != null && ["QB", "WR", "TE"].includes(p.p)) {
    if (pr.total >= 49) out.push({ t: "up", s: `Game total ${pr.total}: the market expects a shootout`, k: "Shootout" });
    else if (pr.total <= 38.5) out.push({ t: "down", s: `Game total ${pr.total}: the market expects a low-scoring game`, k: "Low total" });
  }
  if (pr.wx && p.p === "QB" && pr.wx.wind >= 15) out.push({ t: "down", s: `${pr.wx.wind} mph wind at kickoff. Quarterbacks have scored less in wind like this.`, k: "Windy" });
  const tr = ctx.trending?.[id]; if (tr >= 500) out.push({ t: "info", s: `Added in ${tr.toLocaleString()} Sleeper leagues in the last day` });
  return out;
}

// Lineup-level notes grounded in the correlation study.
export function lineupNotes(ctx, P, starterIds, oppStarterIds = []) {
  const notes = [], pl = (id) => ctx.players[id], pr = P.proj, oppOf = P.oppOf;
  const mine = starterIds.filter(Boolean).map((id) => ({ id, ...pl(id), team: pl(id)?.t }));
  for (const d of mine.filter((x) => x.p === "DEF")) for (const x of mine) {
    if (x.p === "DEF" || oppOf[d.team] !== x.team) continue;
    const r = x.p === "QB" ? -0.36 : x.p === "RB" ? -0.23 : x.p === "WR" ? -0.17 : x.p === "K" ? -0.3 : -0.05;
    notes.push({ t: "down", s: `Your ${d.n} defense faces your ${x.n}. These scores move against each other (r = ${r}).` });
  }
  for (const q of mine.filter((x) => x.p === "QB")) {
    const mates = mine.filter((x) => x.team === q.team && ["WR", "TE"].includes(x.p));
    if (mates.length) notes.push({ t: "info", s: `Stack: ${q.n} with ${mates.map((m) => m.n).join(" and ")} (r ≈ +0.3 to +0.4). Widens your range: good as an underdog, riskier as a favorite.` });
    const opps = mine.filter((x) => oppOf[q.team] === x.team && ["QB", "WR"].includes(x.p));
    if (opps.length) notes.push({ t: "info", s: `${q.n} and ${opps.map((m) => m.n).join(", ")} play each other. Opposing passing games rise together (r ≈ +0.1 to +0.18).` });
  }
  const oppTeams = oppStarterIds.filter(Boolean).map((id) => ({ ...pl(id), id }));
  for (const x of mine.filter((m) => m.p === "WR" || m.p === "TE")) {
    const theirQb = oppTeams.find((o) => o.p === "QB" && o.t === x.team);
    if (theirQb) notes.push({ t: "info", s: `Your ${x.n} and your opponent's ${theirQb.n} are teammates. That partially hedges both of you.` });
  }
  for (const x of mine) {
    const p = pr[x.id];
    if (p?.bye) notes.push({ t: "down", s: `${x.n} is on bye.` });
    else if (p && p.mean === 0 && !p.bye) notes.push({ t: "down", s: `${x.n} has no projection${x.i ? ` (${x.i})` : ""}.` });
  }
  return notes;
}
