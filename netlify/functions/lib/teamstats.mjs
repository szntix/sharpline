// Team profiles from files the app already reads: nflverse's schedule (results and betting lines) and its weekly player stats (efficiency, pace, volume).
// Ratings describe how a team has played, opponent-adjusted, blended with what the betting lines say. They are not a forecast beyond next week's line:
// in a 3,408-game test (2010 to 2025) the closing line beat every rating built from results or lines (see BACKTEST), so win odds come from the line.
import { cached, cachedConditional, nflState } from "./util.mjs";
import { loadWeekly } from "./history.mjs";
import { FIELDS as DFIELDS } from "./defstats.mjs";
import { schedule } from "./schedule.mjs";
import { gsisToSleeper } from "./sources.mjs";
import { loadPlayers } from "../players.mjs";
import { abbr, TEAM_NAME } from "./teams.mjs";
import { rowsFetcher } from "./history.mjs";

export const HFA = 2.0;
export const BACKTEST = { games: 3408, seasons: "2010 to 2025", line: { miss: 10.10, picks: 0.676 }, results: { miss: 10.5, picks: 0.638 }, lines: { miss: 10.45, picks: 0.646 }, blend: { miss: 10.35, picks: 0.654 }, beatTheLineRepeat: 0.008 };
export const CITY = { ARI: "Arizona", ATL: "Atlanta", BAL: "Baltimore", BUF: "Buffalo", CAR: "Carolina", CHI: "Chicago", CIN: "Cincinnati", CLE: "Cleveland", DAL: "Dallas", DEN: "Denver", DET: "Detroit", GB: "Green Bay", HOU: "Houston", IND: "Indianapolis", JAX: "Jacksonville", KC: "Kansas City", LV: "Las Vegas", LAC: "Los Angeles", LAR: "Los Angeles", MIA: "Miami", MIN: "Minnesota", NE: "New England", NO: "New Orleans", NYG: "New York", NYJ: "New York", PHI: "Philadelphia", PIT: "Pittsburgh", SF: "San Francisco", SEA: "Seattle", TB: "Tampa Bay", TEN: "Tennessee", WAS: "Washington" };

// Opponent-adjusted ratings: margin (or betting spread) = home - away + home edge, solved by ridge least squares toward a prior (Cholesky on the 32 x 32 normal equations).
export function ridge(games, teams, { target, prior = null, lam, kappa = 0 }) {
  const n = teams.length, ix = Object.fromEntries(teams.map((t, i) => [t, i]));
  const M = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? lam : 0))), b = teams.map((t) => lam * kappa * (prior?.[t] || 0));
  for (const g of games) {
    const v = target === "spread" ? g.spread : g.hs == null || g.as == null ? null : g.hs - g.as; if (v == null || Number.isNaN(v)) continue;
    const h = ix[g.home], a = ix[g.away]; if (h == null || a == null) continue;
    const y = v - (g.neutral ? 0 : HFA); M[h][h]++; M[a][a]++; M[h][a]--; M[a][h]--; b[h] += y; b[a] -= y;
  }
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = M[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j]; }
  const z = new Array(n).fill(0); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; }
  const r = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * r[k]; r[i] = s / L[i][i]; }
  return Object.fromEntries(teams.map((t, i) => [t, r[i]]));
}
// 1 = best; ties share the better rank. Entries without a value get no rank.
function ranks(vals, higherBetter = true) {
  const e = Object.entries(vals).filter(([, v]) => v != null && Number.isFinite(v)).sort((a, b) => (higherBetter ? b[1] - a[1] : a[1] - b[1])), out = {};
  e.forEach(([k, v], i) => { out[k] = i > 0 && e[i - 1][1] === v ? out[e[i - 1][0]] : i + 1; }); return out;
}
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000), r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

export async function computeTeams() {
  return cached("teams-v2", 15 * 60e3, async () => {
    const state = await nflState(); let season = Number(state.season);
    // Between the league year turning over and the new schedule being published there are no games for the new season. Until there are, keep showing last
    // season's final table (and say so) instead of an empty one; it switches by itself the moment the new schedule exists.
    let cur = await schedule(season), wanted = null;
    if (!cur.length) { const last = await schedule(season - 1).catch(() => []); if (last.length) { cur = last; wanted = season; season -= 1; } }
    const [prev, W, players] = await Promise.all([schedule(season - 1).catch(() => []), loadWeekly(season, 50 * 60e3).catch(() => ({ rows: [], def: {}, kick: {} })), loadPlayers().catch(() => ({}))]);
    const rows = W.rows;   // the defense rows (W.def) ride in each team as dlog
    const g2s = await gsisToSleeper(players).catch(() => ({}));
    const teams = [...new Set(cur.flatMap((g) => [g.home, g.away]))].sort(), played = cur.filter((g) => g.hs != null && g.as != null);
    const throughWeek = played.reduce((m, g) => Math.max(m, g.week), 0), doneWeek = (() => { let w = 0; for (let k = 1; k <= 18; k++) { const wk = cur.filter((g) => g.week === k); if (wk.length && wk.every((g) => g.hs != null)) w = k; else if (wk.length) break; } return w; })();
    const pp = prev.filter((g) => g.hs != null), priorRes = pp.length ? ridge(pp, teams, { target: "margin", lam: 1 }) : null, priorMkt = pp.length ? ridge(pp, teams, { target: "spread", lam: 0.5 }) : null;
    const rate = (upTo) => { const gs = played.filter((g) => g.week <= upTo), res = ridge(gs, teams, { target: "margin", prior: priorRes, lam: 4, kappa: 0.4 }), mkt = ridge(gs, teams, { target: "spread", prior: priorMkt, lam: 0.5, kappa: 0.4 }); return Object.fromEntries(teams.map((t) => [t, { res: res[t], mkt: mkt[t], power: (res[t] + mkt[t]) / 2 }])); };
    const weeklyRatings = []; for (let w = 1; w <= throughWeek; w++) weeklyRatings.push(rate(w));
    const now = weeklyRatings.length ? weeklyRatings[throughWeek - 1] : rate(0), before = weeklyRatings.length > 1 ? weeklyRatings[throughWeek - 2] : null;
    const rankNow = ranks(Object.fromEntries(teams.map((t) => [t, now[t].power]))), rankBefore = before ? ranks(Object.fromEntries(teams.map((t) => [t, before[t].power]))) : rankNow;
    // efficiency, pace and volume from the weekly player rows: [gsis, pos, week, team, opp, ppr, tgt, car, ts, name, adv]
    const off = {}, def = {}, vol = {}, wk = {}, mk = () => ({ pe: 0, db: 0, re: 0, car: 0, weeks: new Set() });
    for (const r of rows) {
      const [gsis, pos, week, tm, op, , tgt, car, , name, adv] = r, t = abbr(tm), o = abbr(op), a = adv || [], db = (a[0] || 0) + (a[1] || 0);
      const O = (off[t] ||= mk()), D = (def[o] ||= mk()); O.pe += a[2] || 0; O.db += db; O.re += a[8] || 0; O.car += car || 0; O.weeks.add(week); D.pe += a[2] || 0; D.db += db; D.re += a[8] || 0; D.car += car || 0;
      const V = (vol[t] ||= { tgt: {}, car: {} }), id = g2s[gsis] || null, key = gsis;
      if (tgt) (V.tgt[key] ||= { id, name, pos, n: 0 }).n += tgt; if (car) (V.car[key] ||= { id, name, pos, n: 0 }).n += car;
      const W = (wk[t] ||= { tgt: {}, car: {} }); W.tgt[week] = (W.tgt[week] || 0) + (tgt || 0); W.car[week] = (W.car[week] || 0) + (car || 0);
    }
    const passOff = {}, runOff = {}, passDef = {}, runDef = {}, defAll = {}, pace = {}, passRate = {};
    for (const t of teams) {
      const O = off[t], D = def[t];
      if (O && O.db >= 20) passOff[t] = O.pe / O.db; if (O && O.car >= 15) runOff[t] = O.re / O.car;
      if (D && D.db >= 20) passDef[t] = D.pe / D.db; if (D && D.car >= 15) runDef[t] = D.re / D.car; if (D && D.db + D.car >= 35) defAll[t] = (D.pe + D.re) / (D.db + D.car);
      if (O && O.weeks.size && O.db + O.car > 0) { pace[t] = (O.db + O.car) / O.weeks.size; passRate[t] = O.db / (O.db + O.car); }
    }
    const R = { po: ranks(passOff), ro: ranks(runOff), pd: ranks(passDef, false), rd: ranks(runDef, false), da: ranks(defAll, false), pace: ranks(pace), pr: ranks(passRate) }, lgPass = Object.values(passRate).length ? Object.values(passRate).reduce((s, v) => s + v, 0) / Object.values(passRate).length : null;
    const out = {};
    for (const t of teams) {
      const mine = cur.filter((g) => g.home === t || g.away === t).sort((a, b) => a.week - b.week), log = [], ahead = []; let w = 0, l = 0, tie = 0, pf = 0, pa = 0;
      for (const g of mine) {
        const home = g.home === t, opp = home ? g.away : g.home, exp = g.spread == null ? null : home ? g.spread : -g.spread;
        if (g.hs != null && g.as != null) { const f = home ? g.hs : g.as, a = home ? g.as : g.hs, m = f - a; m > 0 ? w++ : m < 0 ? l++ : tie++; pf += f; pa += a; log.push({ week: g.week, opp, home, neutral: g.neutral, pf: f, pa: a, margin: m, line: exp, cover: exp == null ? null : m - exp }); }
        else ahead.push({ week: g.week, opp, home, neutral: g.neutral, line: exp, total: g.total, day: g.gameday, roof: g.roof || null });
      }
      const n = log.length, V = vol[t], top = (m, k) => { const tot = Object.values(m).reduce((s, x) => s + x.n, 0); return Object.values(m).sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).slice(0, k).map((x) => ({ id: x.id, name: x.name, pos: x.pos, n: x.n, share: tot ? r3(x.n / tot) : 0 })); };
      out[t] = { code: t, name: TEAM_NAME[t] || t, city: CITY[t] || "", record: [w, l, tie], games: n, pf: n ? r1(pf / n) : null, pa: n ? r1(pa / n) : null,
        rating: r1(now[t].power), res: r1(now[t].res), mkt: r1(now[t].mkt), rank: rankNow[t], prevRank: rankBefore[t], trend: weeklyRatings.map((x) => r1(x[t].power)), early: n < 3, log, ahead,
        bye: Array.from({ length: 18 }, (_, i) => i + 1).filter((k) => !mine.some((g) => g.week === k)),
        dlog: W.def[t] || [], eff: { passOff: passOff[t] != null ? { v: r3(passOff[t]), rank: R.po[t] } : null, runOff: runOff[t] != null ? { v: r3(runOff[t]), rank: R.ro[t] } : null, passDef: passDef[t] != null ? { v: r3(passDef[t]), rank: R.pd[t] } : null, runDef: runDef[t] != null ? { v: r3(runDef[t]), rank: R.rd[t] } : null, defRank: R.da[t] ?? null },
        pace: pace[t] != null ? { v: r1(pace[t]), rank: R.pace[t] } : null, passRate: passRate[t] != null ? { v: r3(passRate[t]), rank: R.pr[t], lg: r3(lgPass) } : null,
        tshare: V ? top(V.tgt, 4) : [], cshare: V ? top(V.car, 3) : [], weekly: wk[t] || { tgt: {}, car: {} } };
    }
    return { season, fallback: wanted ? { season, wanted } : null, throughWeek, doneWeek, asOf: Date.now(), order: [...teams].sort((a, b) => rankNow[a] - rankNow[b]), teams: out, dfields: DFIELDS, backtest: BACKTEST };
  });
}
