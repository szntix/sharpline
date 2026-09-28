// Findings from 5 regular seasons (2021–2025) of nflverse data, ~2,700 team-games per pair.
// Correlations use each player's points relative to his own season average, so they measure
// how scores move together in a given game, not whether good players are on good teams.
// ± is a 95% confidence interval.

export const STUDY = {
  seasons: "2021–2025",
  same: [
    { a: "QB", b: "WR1", r: 0.401, ci: 0.032, note: "The strongest pairing in fantasy." },
    { a: "QB", b: "WR2", r: 0.281, ci: 0.035 },
    { a: "QB", b: "TE1", r: 0.264, ci: 0.035 },
    { a: "K", b: "DST", r: 0.261, ci: 0.035, note: "Surprisingly strong: good defense → short fields → field goals." },
    { a: "RB1", b: "K", r: 0.149, ci: 0.037 },
    { a: "QB", b: "RB1", r: 0.069, ci: 0.038 },
    { a: "WR1", b: "WR2", r: 0.067, ci: 0.037 },
    { a: "RB1", b: "DST", r: 0.061, ci: 0.037, note: "Much weaker than conventional wisdom suggests." },
    { a: "QB", b: "K", r: 0.06, ci: 0.038, note: "Close to zero: TD drives help the QB, stalled drives help the kicker." },
    { a: "RB1", b: "WR1", r: -0.031, ci: 0.038 },
    { a: "QB", b: "DST", r: -0.089, ci: 0.037 },
  ],
  opp: [
    { a: "DST", b: "Opp QB", r: -0.363, ci: 0.033, note: "Never start a DST against your own QB unless you must." },
    { a: "DST", b: "Opp K", r: -0.3, ci: 0.034 },
    { a: "DST", b: "Opp RB1", r: -0.228, ci: 0.036 },
    { a: "QB", b: "Opp QB", r: 0.183, ci: 0.037, note: "Shootouts are real." },
    { a: "DST", b: "Opp WR1", r: -0.166, ci: 0.037 },
    { a: "K", b: "Opp K", r: -0.121, ci: 0.037 },
    { a: "WR1", b: "Opp WR1", r: 0.112, ci: 0.037 },
    { a: "QB", b: "Opp WR1", r: 0.109, ci: 0.037 },
    { a: "RB1", b: "Opp RB1", r: -0.037, ci: 0.038 },
  ],
  rbBySpread: [["7+ pt underdog", 12.43], ["3–7 pt underdog", 13.42], ["Pick'em", 14.78], ["3–7 pt favorite", 16.18], ["7+ pt favorite", 16.2]],
  perImpliedPoint: { QB: 0.9, WR1: 0.7, RB1: 0.34, TE: 0.33, K: 0.04 },
  targetLeaderOut: { WR: { with: 0.144, without: 0.171, lift: 18.5, n: 100 }, TE: { with: 0.131, without: 0.136, lift: 3.9, n: 50 }, RB: { with: 0.11, without: 0.119, lift: 8, n: 37 } },
  volatility: { QB: [6.78, 0.061], RB: [3.85, 0.284], WR: [3.39, 0.338], TE: [2.35, 0.42], K: [4.2, 0.1], DEF: [5.2, 0.12] },
};

// Pairwise correlation used by the matchup simulator.
// Unmeasured pairs are left at 0 rather than guessed.
const SAME = { "QB|WR": 0.34, "QB|TE": 0.26, "QB|RB": 0.07, "QB|K": 0.06, "QB|DEF": -0.09, "RB|K": 0.15, "RB|DEF": 0.06, "K|DEF": 0.26,
  "WR|WR": 0.07, "TE|WR": 0.02, "RB|RB": 0.06, "RB|WR": -0.03 };
const OPP = { "QB|QB": 0.18, "WR|WR": 0.11, "QB|WR": 0.11, "RB|RB": -0.04, "DEF|QB": -0.36, "DEF|WR": -0.17, "DEF|RB": -0.23, "DEF|TE": -0.05, "DEF|K": -0.3, "K|K": -0.12 };

const norm = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k.split("|").sort().join("|"), v]));
const SAME_N = norm(SAME), OPP_N = norm(OPP);

export function pairCorr(pa, ta, pb, tb, oppOf) {
  const key = [pa, pb].sort().join("|");
  if (ta && ta === tb) return SAME_N[key] ?? 0;
  if (ta && oppOf[ta] === tb) return OPP_N[key] ?? 0;
  return 0;
}
