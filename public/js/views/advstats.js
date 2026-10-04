// The efficiency stats a player's page shows as tiles and the rankings page ranks. One definition, so a tile and its leaderboard can never disagree.
const ep = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2), pc = (v) => Math.round(v * 100) + "%", n1 = (v) => v.toFixed(1), n2 = (v) => v.toFixed(2), cp = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1);
export const ADV = {
  epaDb: { label: "EPA per dropback", fmt: ep, kind: "signed", help: "Expected points added per dropback, counting passes and sacks. Higher is better." },
  cpoe: { label: "Completion % over expected", fmt: cp, kind: "signed", help: "How much his completion percentage beats what those throws were expected to produce. Higher is better." },
  rushEpa: { label: "EPA per carry", fmt: ep, kind: "signed", help: "Expected points added per rushing attempt. Higher is better." },
  recEpa: { label: "EPA per target", fmt: ep, kind: "signed", help: "Expected points added per target. Higher is better." },
  wopr: { label: "WOPR (target and air yards share)", short: "WOPR", fmt: n2, help: "A blend of his share of the team's targets and of its air yards. Higher means a bigger role." },
  ays: { label: "Air yards share", fmt: pc, help: "His share of the team's air yards: how much of the downfield passing runs through him." },
  adot: { label: "Depth of target", fmt: n1, kind: "style", help: "How far downfield he is targeted, on average. Deeper is not better or worse, just a different role." },
  yac: { label: "Yards after catch", fmt: n1, help: "Yards gained after the catch, per catch." },
  catchRate: { label: "Catch rate", fmt: pc, help: "Receptions per target." },
  fd: { label: "First downs a game", fmt: n1, help: "First downs a game from passing, rushing and receiving." },
};
export const ADV_BY_POS = { QB: ["epaDb", "cpoe", "rushEpa", "fd"], RB: ["rushEpa", "recEpa", "fd", "catchRate"], WR: ["wopr", "ays", "adot", "yac", "recEpa", "catchRate"], TE: ["wopr", "ays", "adot", "yac", "recEpa", "catchRate"] };
export const TIERS = [[85, "Elite", "g2"], [65, "Strong", "g1"], [35, "Average", "n"], [15, "Weak", "b1"], [0, "Poor", "b2"]];
// Everyone at the position with two or more games and enough plays for this stat to exist.
export function peerList(usage, pos, key) { const out = []; for (const [id, x] of Object.entries(usage?.players || {})) if (x.p === pos && x.adv && x.adv.g >= 2 && x.adv[key] != null) out.push({ id, v: x.adv[key], g: x.adv.g }); return out; }
export const peerCount = (usage, pos) => Object.values(usage?.players || {}).filter((x) => x.p === pos && x.adv && x.adv.g >= 2).length;
export const rankOf = (v, vals) => 1 + vals.filter((x) => x > v).length;
// Percentile among peers, a one-word grade, and a tone. Needs ten peers to grade at all. A negative EPA or CPOE is never graded good, a positive one never bad,
// and depth of target is a style (Deep, Mixed, Short) with no good or bad.
export function gradeOf(v, vals, kind) {
  const pct = vals.length >= 10 ? Math.round((100 * vals.filter((x) => x < v).length) / vals.length) : null; if (pct == null) return { pct: null, word: "", tone: "n" };
  const t = TIERS.find(([c]) => pct >= c); let word = t[1], tone = t[2];
  if (kind === "style") { word = pct >= 65 ? "Deep" : pct <= 35 ? "Short" : "Mixed"; tone = "n"; }
  if (kind === "signed") { if (v < 0 && (tone === "g1" || tone === "g2")) tone = "n"; if (v > 0 && (tone === "b1" || tone === "b2")) tone = "n"; }
  return { pct, word, tone };
}
