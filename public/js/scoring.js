// Scoring keys follow Sleeper's naming so imported leagues map 1:1.

export const SCORING_FIELDS = [
  { g: "Passing", k: "pass_yd", l: "Per passing yard" },
  { g: "Passing", k: "pass_td", l: "Passing TD" },
  { g: "Passing", k: "pass_int", l: "Interception" },
  { g: "Passing", k: "pass_2pt", l: "2-pt pass" },
  { g: "Passing", k: "pass_cmp", l: "Per completion" },
  { g: "Passing", k: "pass_att", l: "Per attempt" },
  { g: "Passing", k: "bonus_pass_yd_300", l: "300+ yard bonus" },
  { g: "Passing", k: "bonus_pass_yd_400", l: "400+ yard bonus" },
  { g: "Rushing", k: "rush_yd", l: "Per rushing yard" },
  { g: "Rushing", k: "rush_td", l: "Rushing TD" },
  { g: "Rushing", k: "rush_att", l: "Per carry" },
  { g: "Rushing", k: "rush_2pt", l: "2-pt rush" },
  { g: "Rushing", k: "bonus_rush_yd_100", l: "100+ yard bonus" },
  { g: "Receiving", k: "rec", l: "Per reception" },
  { g: "Receiving", k: "bonus_rec_te", l: "TE bonus per reception" },
  { g: "Receiving", k: "bonus_rec_rb", l: "RB bonus per reception" },
  { g: "Receiving", k: "bonus_rec_wr", l: "WR bonus per reception" },
  { g: "Receiving", k: "rec_yd", l: "Per receiving yard" },
  { g: "Receiving", k: "rec_td", l: "Receiving TD" },
  { g: "Receiving", k: "rec_2pt", l: "2-pt reception" },
  { g: "Receiving", k: "bonus_rec_yd_100", l: "100+ yard bonus" },
  { g: "Misc", k: "fum_lost", l: "Fumble lost" },
  { g: "Kicking", k: "fgm_0_19", l: "FG 0–19" },
  { g: "Kicking", k: "fgm_20_29", l: "FG 20–29" },
  { g: "Kicking", k: "fgm_30_39", l: "FG 30–39" },
  { g: "Kicking", k: "fgm_40_49", l: "FG 40–49" },
  { g: "Kicking", k: "fgm_50p", l: "FG 50+" },
  { g: "Kicking", k: "xpm", l: "Extra point" },
  { g: "Kicking", k: "fgmiss", l: "Missed FG" },
  { g: "Kicking", k: "xpmiss", l: "Missed XP" },
  { g: "Defense", k: "sack", l: "Sack" },
  { g: "Defense", k: "int", l: "Interception" },
  { g: "Defense", k: "fum_rec", l: "Fumble recovery" },
  { g: "Defense", k: "def_td", l: "Defensive TD" },
  { g: "Defense", k: "def_st_td", l: "Return TD" },
  { g: "Defense", k: "safe", l: "Safety" },
  { g: "Defense", k: "blk_kick", l: "Blocked kick" },
  { g: "Defense", k: "pts_allow_0", l: "0 points allowed" },
  { g: "Defense", k: "pts_allow_1_6", l: "1–6 allowed" },
  { g: "Defense", k: "pts_allow_7_13", l: "7–13 allowed" },
  { g: "Defense", k: "pts_allow_14_20", l: "14–20 allowed" },
  { g: "Defense", k: "pts_allow_21_27", l: "21–27 allowed" },
  { g: "Defense", k: "pts_allow_28_34", l: "28–34 allowed" },
  { g: "Defense", k: "pts_allow_35p", l: "35+ allowed" },
];

const BASE = {
  pass_yd: 0.04, pass_td: 4, pass_int: -2, pass_2pt: 2, rush_yd: 0.1, rush_td: 6, rush_2pt: 2,
  rec: 0, rec_yd: 0.1, rec_td: 6, rec_2pt: 2, fum_lost: -2,
  fgm_0_19: 3, fgm_20_29: 3, fgm_30_39: 3, fgm_40_49: 4, fgm_50p: 5, xpm: 1, fgmiss: -1, xpmiss: -1,
  sack: 1, int: 2, fum_rec: 2, def_td: 6, def_st_td: 6, safe: 2, blk_kick: 2,
  pts_allow_0: 10, pts_allow_1_6: 7, pts_allow_7_13: 4, pts_allow_14_20: 1, pts_allow_21_27: 0, pts_allow_28_34: -1, pts_allow_35p: -4,
};

export const SCORING_PRESETS = {
  ppr: { label: "PPR", s: { ...BASE, rec: 1 } },
  half: { label: "Half PPR", s: { ...BASE, rec: 0.5 } },
  standard: { label: "Standard (no PPR)", s: { ...BASE } },
  ppr6: { label: "PPR, 6-pt pass TD", s: { ...BASE, rec: 1, pass_td: 6 } },
  tep: { label: "PPR + TE premium (1.5)", s: { ...BASE, rec: 1, bonus_rec_te: 0.5 } },
  superflex: { label: "Superflex PPR, −1 INT", s: { ...BASE, rec: 1, pass_int: -1 } },
  bestball: { label: "Best ball (half PPR, 4-pt pass TD, −1 INT)", s: { ...BASE, rec: 0.5, pass_int: -1 } },
};

export const SLOT_ELIG = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"], WRRB_FLEX: ["RB", "WR"], REC_FLEX: ["WR", "TE"], SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};
export const SLOT_LABEL = { FLEX: "FLEX", WRRB_FLEX: "W/R", REC_FLEX: "W/T", SUPER_FLEX: "SF", DEF: "DST" };

// Which position tabs a league should show. A position appears only if some starting slot can use it, so a
// league without a kicker or defense never sees those tabs. "FLEX" appears when any slot takes more than one position.
export const FLEX_POS = ["RB", "WR", "TE"];
export const usablePositions = (slots) => new Set(slots.flatMap((s) => SLOT_ELIG[s] || []));
export function positionsFor(slots) {
  const usable = usablePositions(slots), list = ["ALL", ...["QB", "RB", "WR", "TE"].filter((p) => usable.has(p))];
  if (slots.some((s) => (SLOT_ELIG[s] || []).length > 1)) list.push("FLEX");
  for (const p of ["K", "DEF"]) if (usable.has(p)) list.push(p);
  return list;
}
export const inPosition = (pos, selected) => selected === "ALL" || (selected === "FLEX" ? FLEX_POS.includes(pos) : pos === selected);

export const ROSTER_PRESETS = {
  standard: { label: "Standard (1QB, 2RB, 2WR, TE, Flex, K, DST)", slots: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"], bench: 6 },
  threeWr: { label: "3 WR (1QB, 2RB, 3WR, TE, Flex, K, DST)", slots: ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "K", "DEF"], bench: 6 },
  superflex: { label: "Superflex (1QB, 2RB, 2WR, TE, 2 Flex, SF)", slots: ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "SUPER_FLEX"], bench: 12 },
  twoQb: { label: "2 QB (2QB, 2RB, 3WR, TE, Flex, K, DST)", slots: ["QB", "QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "K", "DEF"], bench: 7 },
  noKDef: { label: "No K / DST (1QB, 2RB, 3WR, TE, 2 Flex)", slots: ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "FLEX"], bench: 7 },
  bestball: { label: "Best ball (1QB, 2RB, 3WR, TE, Flex)", slots: ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX"], bench: 12 },
};

export const LEAGUE_TYPES = { redraft: "Redraft", keeper: "Keeper", dynasty: "Dynasty", bestball: "Best ball" };
export const TYPE_HELP = {
  redraft: "Only this season counts.",
  keeper: "Trade values add next season at a lower weight, with older players discounted for age.",
  dynasty: "Trade values add the next three seasons, with older players discounted for age (running backs fade first).",
  bestball: "There are no weekly lineups: your best score each week counts, so players with big swings are worth more.",
};

// ---- threshold bonuses need a probability, not an average ----
function pOver(mean, threshold, sigma) {
  if (!mean || mean <= 0) return 0;
  const mu = Math.log(mean) - (sigma * sigma) / 2;
  const z = (Math.log(threshold) - mu) / sigma;
  return 1 - ncdf(z);
}
function ncdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Expected fantasy points from expected stats. `actual` = true scores real stat lines (no bonus probabilities).
const TIERS = [["pts_allow_0", -Infinity, 0.5], ["pts_allow_1_6", 0.5, 6.5], ["pts_allow_7_13", 6.5, 13.5], ["pts_allow_14_20", 13.5, 20.5],
  ["pts_allow_21_27", 20.5, 27.5], ["pts_allow_28_34", 27.5, 34.5], ["pts_allow_35p", 34.5, Infinity]];
const FG_SPLIT = [["fgm_0_19", 0.02], ["fgm_20_29", 0.25], ["fgm_30_39", 0.28], ["fgm_40_49", 0.27], ["fgm_50p", 0.18]];

// Some sources summarize: points allowed as a single number, or field goals as a total. Expand those.
function expand(stats, pos, actual) {
  if (pos === "DEF" && !actual && stats.pts_allow != null && !TIERS.some(([k]) => stats[k] != null)) {
    const e = { ...stats };
    for (const [k, lo, hi] of TIERS) e[k] = ncdf((hi - stats.pts_allow) / 9.6) - ncdf((lo - stats.pts_allow) / 9.6);
    return e;
  }
  if (pos === "K" && stats.fgm != null && !FG_SPLIT.some(([k]) => stats[k] != null)) {
    const e = { ...stats }; for (const [k, f] of FG_SPLIT) e[k] = stats.fgm * f; return e;
  }
  return stats;
}

export function points(stats, s, pos, actual = false) {
  if (!stats) return 0;
  stats = expand(stats, pos, actual);
  let t = 0;
  for (const [k, v] of Object.entries(stats)) {
    if (k.startsWith("bonus_") || k === "pts_allow") continue;
    const w = s[k]; if (w) t += w * v;
  }
  const rec = stats.rec || 0;
  if (pos === "TE" && s.bonus_rec_te) t += s.bonus_rec_te * rec;
  if (pos === "RB" && s.bonus_rec_rb) t += s.bonus_rec_rb * rec;
  if (pos === "WR" && s.bonus_rec_wr) t += s.bonus_rec_wr * rec;
  const bonus = (key, stat, thr, sig) => {
    if (!s[key]) return;
    const v = stats[stat] || 0;
    t += s[key] * (actual ? (v >= thr ? 1 : 0) : pOver(v, thr, sig));
  };
  bonus("bonus_pass_yd_300", "pass_yd", 300, 0.28); bonus("bonus_pass_yd_400", "pass_yd", 400, 0.28);
  bonus("bonus_rush_yd_100", "rush_yd", 100, 0.5); bonus("bonus_rush_yd_200", "rush_yd", 200, 0.5);
  bonus("bonus_rec_yd_100", "rec_yd", 100, 0.5); bonus("bonus_rec_yd_200", "rec_yd", 200, 0.5);
  if (actual && pos === "DEF" && stats.pts_allow != null && stats.pts_allow_0 == null) {
    const pa = stats.pts_allow;
    const key = pa === 0 ? "pts_allow_0" : pa <= 6 ? "pts_allow_1_6" : pa <= 13 ? "pts_allow_7_13" : pa <= 20 ? "pts_allow_14_20" : pa <= 27 ? "pts_allow_21_27" : pa <= 34 ? "pts_allow_28_34" : "pts_allow_35p";
    t += s[key] || 0;
  }
  return t;
}

export const PPR = SCORING_PRESETS.ppr.s;
